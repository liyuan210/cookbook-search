const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const winston = require('winston');
require('dotenv').config();

// 环境变量配置
const config = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3000,
    CACHE_EXPIRY: parseInt(process.env.CACHE_EXPIRY) || 5 * 60 * 1000,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

// 配置 Winston 日志
const logger = winston.createLogger({
    level: config.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

const app = express();

// 基础中间件
app.use(cors());
app.use(express.json());
app.use(compression());

// 速率限制
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100 // 限制每个IP 15分钟内最多100个请求
});
app.use(limiter);

// 请求日志中间件
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// 根路由处理
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 缓存对象
const cache = {
    recipes: new Map(),
    searchResults: new Map()
};

// 缓存清理函数
const cleanupCache = () => {
    const now = Date.now();
    for (const [key, value] of cache.recipes) {
        if (now - value.timestamp > config.CACHE_EXPIRY) {
            cache.recipes.delete(key);
        }
    }
    for (const [key, value] of cache.searchResults) {
        if (now - value.timestamp > config.CACHE_EXPIRY) {
            cache.searchResults.delete(key);
        }
    }
};

// 定期清理缓存
setInterval(cleanupCache, config.CACHE_EXPIRY);

// 目标网站
const targetSites = [
    'https://www.xiachufang.com',
    'https://www.meishij.net',
    'https://www.douguo.com'
];

// 通用请求头
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

// 获取网页内容
async function fetchRecipeContent(url) {
    logger.info(`Fetching content from: ${url}`);
    
    // 检查缓存
    const cached = cache.recipes.get(url);
    if (cached && Date.now() - cached.timestamp < config.CACHE_EXPIRY) {
        logger.info('Returning cached content');
        return cached.data;
    }

    try {
        logger.info('Making HTTP request...');
        const response = await axios.get(url, { 
            headers,
            timeout: 5000 // 5秒超时
        });
        logger.info('Response received, parsing content...');
        const $ = cheerio.load(response.data);
        
        let content = null;
        // 根据不同网站解析内容
        if (url.includes('xiachufang.com')) {
            content = {
                title: $('.page-title').text().trim(),
                ingredients: $('.ingredient').map((i, el) => $(el).text().trim()).get(),
                steps: $('.steps li').map((i, el) => $(el).text().trim()).get(),
                image: $('.cover img').attr('src')
            };
        } else if (url.includes('meishij.net')) {
            content = {
                title: $('.recipe-title').text().trim(),
                ingredients: $('.ingredients li').map((i, el) => $(el).text().trim()).get(),
                steps: $('.steps li').map((i, el) => $(el).text().trim()).get(),
                image: $('.recipe-img img').attr('src')
            };
        } else if (url.includes('douguo.com')) {
            content = {
                title: $('.recipe-title').text().trim(),
                ingredients: $('.ingredient-item').map((i, el) => $(el).text().trim()).get(),
                steps: $('.step-item').map((i, el) => $(el).text().trim()).get(),
                image: $('.recipe-img img').attr('src')
            };
        }

        // 存储到缓存
        if (content) {
            logger.info('Content parsed successfully, storing in cache');
            cache.recipes.set(url, {
                data: content,
                timestamp: Date.now()
            });
        } else {
            logger.warn('No content found');
        }

        return content;
    } catch (error) {
        logger.error('Error fetching content:', {
            error: error.message,
            stack: error.stack,
            url
        });
        return null;
    }
}

// 搜索 API
app.get('/api/search', async (req, res) => {
    const query = req.query.q || req.query.query;
    
    if (!query) {
        return res.status(400).json({ error: '请提供搜索关键词' });
    }

    // 检查缓存
    const cached = cache.searchResults.get(query);
    if (cached && Date.now() - cached.timestamp < config.CACHE_EXPIRY) {
        return res.json(cached.data);
    }

    try {
        const results = [
            {
                title: `${query}的做法`,
                source: 'Xiachufang',
                url: `https://www.xiachufang.com/search/?keyword=${encodeURIComponent(query)}`,
                content: null
            },
            {
                title: `${query}的做法大全`,
                source: 'Meishij',
                url: `https://www.meishij.net/so/${encodeURIComponent(query)}`,
                content: null
            },
            {
                title: `${query}的做法步骤`,
                source: 'Douguo',
                url: `https://www.douguo.com/search/${encodeURIComponent(query)}`,
                content: null
            }
        ];

        // 存储到缓存
        cache.searchResults.set(query, {
            data: { recipes: results },
            timestamp: Date.now()
        });

        res.json({ recipes: results });

        // 异步加载详细内容
        results.forEach(async (result) => {
            try {
                result.content = await fetchRecipeContent(result.url);
            } catch (error) {
                logger.error(`Error fetching content for ${result.url}:`, error);
            }
        });
    } catch (error) {
        logger.error('Search error:', {
            error: error.message,
            stack: error.stack,
            query
        });
        res.status(500).json({ error: '搜索服务错误' });
    }
});

// 启动服务器
const port = process.env.PORT || 3000;
app.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
});
