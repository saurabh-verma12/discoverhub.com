
import express from 'express';  
import fetch from 'node-fetch'; 
import dotenv from 'dotenv';    
import path from 'path';

const app = express();
dotenv.config();
const PORT = 3000;
app.use(express.static('public'));

async function fetchWithDelay(url, delay) {
  return new Promise((resolve) => {
    setTimeout(async () => {
      const response = await fetch(url);
      resolve(response);
    }, delay);
  });
}

async function fetchYouTubeVideos(query) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();
  const videos = data.items;

  const videoDetails = await Promise.all(videos.map(async (video) => {
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${video.id.videoId}&key=${apiKey}`;
    const statsResponse = await fetch(statsUrl);
    const statsData = await statsResponse.json();

    return {
      title: video.snippet.title,
      link: `https://www.youtube.com/watch?v=${video.id.videoId}`,
      views: statsData.items[0].statistics.viewCount,
      likes: statsData.items[0].statistics.likeCount,
    };
  }));

  return videoDetails.sort((a, b) => b.views - a.views);
}


async function fetchArticles(query) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.CSE_ID;
  const url = `https://www.googleapis.com/customsearch/v1?q=${query}&key=${apiKey}&cx=${cx}`;

  const response = await fetch(url);
  const data = await response.json();
  const articles = data.items.map((item) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
  }));

  return articles;
}

async function fetchAcademicPapers(query) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${query}&retmode=json`;

  const response = await fetch(url);
  const data = await response.json();
  const paperIds = data.esearchresult.idlist;

  const papers = await Promise.all(paperIds.map(async (id) => {
    const detailsUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${id}&retmode=json`;

  
    const detailsResponse = await fetchWithDelay(detailsUrl, 1000);
    const detailsData = await detailsResponse.json();

    if (detailsData.result && detailsData.result[id]) {
      const paper = detailsData.result[id];
      return {
        title: paper.title,
        link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        summary: paper.summary || 'No summary available',
      };
    } else {
      console.warn(`No paper found for ID: ${id}`);
      return null;
    }
  }));

  return papers.filter(paper => paper !== null);
}


function rankResults(results) {
  return results.sort((a, b) => {
    const rankA = (a.views || 0) + (a.likes || 0) * 2;
    const rankB = (b.views || 0) + (b.likes || 0) * 2;
    return rankB - rankA;
  });
}

async function search(query) {
  const [videos, articles, papers] = await Promise.all([
    fetchYouTubeVideos(query),
    fetchArticles(query),
    fetchAcademicPapers(query),
  ]);

  return {
    videos: rankResults(videos),
    articles: articles,  
    papers: papers,  
  };
}


app.get('/search', async (req, res) => {
    const query = req.query.q;
    try {
      const results = await search(query);
      res.json(results);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error fetching search results' });
    }
  });


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});