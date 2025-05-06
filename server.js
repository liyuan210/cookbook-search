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

// 搜索API
app.get('/api/search', async (req, res) => {
    const { query } = req.query;
    
    if (!query) {
        return res.status(400).json({ error: '请提供搜索关键词' });
    }

    try {
        const results = [];
        // 这里先返回模拟数据
        results.push({
            title: `${query}的做法`,
            source: '下厨房',
            url: 'https://www.xiachufang.com'
        });

        res.json(results);
    } catch (error) {
        console.error('搜索出错:', error);
        res.status(500).json({ error: '搜索服务出错' });
    }
});

// 健康检查端点
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// 导出 app 而不是直接监听
module.exports = app;
