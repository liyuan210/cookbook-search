const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

// 启用 CORS
app.use(cors());
app.use(express.json());

// 缓存对象
const cache = {
    recipes: new Map(),
    searchResults: new Map()
};

// 缓存过期时间（5分钟）
const CACHE_EXPIRY = 5 * 60 * 1000;

// 目标网站列表
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

// 抓取网页内容
async function fetchRecipeContent(url) {
    // 检查缓存
    const cached = cache.recipes.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
        return cached.data;
    }

    try {
        const response = await axios.get(url, { headers });
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

        // 存入缓存
        if (content) {
            cache.recipes.set(url, {
                data: content,
                timestamp: Date.now()
            });
        }

        return content;
    } catch (error) {
        console.error('抓取内容出错:', error);
        return null;
    }
}

// 搜索API
app.get('/api/search', async (req, res) => {
    const { query } = req.query;
    
    if (!query) {
        return res.status(400).json({ error: '请提供搜索关键词' });
    }

    // 检查缓存
    const cached = cache.searchResults.get(query);
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
        return res.json(cached.data);
    }

    try {
        const results = [
            {
                title: `${query}的做法`,
                source: '下厨房',
                url: `https://www.xiachufang.com/search/?keyword=${encodeURIComponent(query)}`,
                content: null
            },
            {
                title: `家常${query}的做法`,
                source: '美食天下',
                url: `https://www.meishij.net/search.php?q=${encodeURIComponent(query)}`,
                content: null
            },
            {
                title: `${query}的详细做法`,
                source: '豆果美食',
                url: `https://www.douguo.com/search/${encodeURIComponent(query)}`,
                content: null
            }
        ];

        // 存入缓存
        cache.searchResults.set(query, {
            data: results,
            timestamp: Date.now()
        });

        res.json(results);

        // 异步加载详细内容
        results.forEach(async (result) => {
            result.content = await fetchRecipeContent(result.url);
        });
    } catch (error) {
        console.error('搜索出错:', error);
        res.status(500).json({ error: '搜索服务出错' });
    }
});

// 获取菜谱详情API
app.get('/api/recipe', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: '请提供菜谱URL' });
    }

    try {
        const content = await fetchRecipeContent(url);
        if (content) {
            res.json(content);
        } else {
            res.status(404).json({ error: '无法获取菜谱内容' });
        }
    } catch (error) {
        console.error('获取菜谱详情出错:', error);
        res.status(500).json({ error: '获取菜谱详情失败' });
    }
});

// 健康检查端点
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// 导出 app 而不是直接监听
module.exports = app;
