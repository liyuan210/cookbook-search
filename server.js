const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

// 启用 CORS
app.use(cors());
app.use(express.json());

// 目标网站列表
const targetSites = [
    'https://www.xiachufang.com',
    'https://www.meishij.net',
    'https://www.douguo.com'
];

// 抓取网页内容
async function fetchRecipeContent(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(response.data);
        
        // 根据不同网站解析内容
        if (url.includes('xiachufang.com')) {
            return {
                title: $('.page-title').text().trim(),
                ingredients: $('.ingredient').map((i, el) => $(el).text().trim()).get(),
                steps: $('.steps li').map((i, el) => $(el).text().trim()).get(),
                image: $('.cover img').attr('src')
            };
        } else if (url.includes('meishij.net')) {
            return {
                title: $('.recipe-title').text().trim(),
                ingredients: $('.ingredients li').map((i, el) => $(el).text().trim()).get(),
                steps: $('.steps li').map((i, el) => $(el).text().trim()).get(),
                image: $('.recipe-img img').attr('src')
            };
        } else if (url.includes('douguo.com')) {
            return {
                title: $('.recipe-title').text().trim(),
                ingredients: $('.ingredient-item').map((i, el) => $(el).text().trim()).get(),
                steps: $('.step-item').map((i, el) => $(el).text().trim()).get(),
                image: $('.recipe-img img').attr('src')
            };
        }
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

        // 抓取每个结果的内容
        for (let result of results) {
            result.content = await fetchRecipeContent(result.url);
        }

        res.json(results);
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
