const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

// Enable CORS
app.use(cors());
app.use(express.json());

// Cache object
const cache = {
    recipes: new Map(),
    searchResults: new Map()
};

// Cache expiry time (5 minutes)
const CACHE_EXPIRY = 5 * 60 * 1000;

// Target websites
const targetSites = [
    'https://www.xiachufang.com',
    'https://www.meishij.net',
    'https://www.douguo.com'
];

// Common headers
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

// Fetch webpage content
async function fetchRecipeContent(url) {
    // Check cache
    const cached = cache.recipes.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
        return cached.data;
    }

    try {
        const response = await axios.get(url, { headers });
        const $ = cheerio.load(response.data);
        
        let content = null;
        // Parse content based on different websites
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

        // Store in cache
        if (content) {
            cache.recipes.set(url, {
                data: content,
                timestamp: Date.now()
            });
        }

        return content;
    } catch (error) {
        console.error('Error fetching content:', error);
        return null;
    }
}

// Search API
app.get('/api/search', async (req, res) => {
    const { query } = req.query;
    
    if (!query) {
        return res.status(400).json({ error: 'Please provide a search keyword' });
    }

    // Check cache
    const cached = cache.searchResults.get(query);
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
        return res.json(cached.data);
    }

    try {
        const results = [
            {
                title: `How to Make ${query}`,
                source: 'Xiachufang',
                url: `https://www.xiachufang.com/search/?keyword=${encodeURIComponent(query)}`,
                content: null
            },
            {
                title: `Homemade ${query} Recipe`,
                source: 'Meishij',
                url: `https://www.meishij.net/search.php?q=${encodeURIComponent(query)}`,
                content: null
            },
            {
                title: `Detailed ${query} Recipe`,
                source: 'Douguo',
                url: `https://www.douguo.com/search/${encodeURIComponent(query)}`,
                content: null
            }
        ];

        // Store in cache
        cache.searchResults.set(query, {
            data: results,
            timestamp: Date.now()
        });

        res.json(results);

        // Asynchronously load detailed content
        results.forEach(async (result) => {
            result.content = await fetchRecipeContent(result.url);
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search service error' });
    }
});

// Get recipe details API
app.get('/api/recipe', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'Please provide a recipe URL' });
    }

    try {
        const content = await fetchRecipeContent(url);
        if (content) {
            res.json(content);
        } else {
            res.status(404).json({ error: 'Unable to fetch recipe content' });
        }
    } catch (error) {
        console.error('Error fetching recipe details:', error);
        res.status(500).json({ error: 'Failed to fetch recipe details' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Export app instead of direct listening
module.exports = app;
