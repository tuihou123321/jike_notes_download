// background.js (Corrected Version)

let csvData = null;
let authorName = '';
let crawlInProgress = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'start_crawl' && !crawlInProgress) {
        crawlInProgress = true;
        const { username, token, includeImages } = message.payload;
        fetchAllPages(username, token, includeImages)
            .catch(err => console.error("爬取失败:", err))
            .finally(() => {
                crawlInProgress = false;
            });
        return true; // Indicates that the response is sent asynchronously
    } else if (message.type === 'download_csv' && csvData) {
        downloadCSV(); // This function is now async, but the call remains the same
    }
});

async function fetchAllPages(username, token, includeImages) {
    let allPosts = [];
    let loadMoreKey = null;
    let page = 1;

    const updateStatus = (text, done = false, error = false) => {
        chrome.runtime.sendMessage({ type: 'status_update', text, done, error });
    };

    updateStatus('正在初始化...');

    do {
        try {
            updateStatus(`正在爬取第 ${page} 页...`);
            const response = await fetch('https://api.ruguoapp.com/1.0/personalUpdate/single', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-jike-access-token': token,
                },
                body: JSON.stringify({
                    username: username,
                    limit: 20,
                    loadMoreKey: loadMoreKey,
                }),
            });

            if (!response.ok) {
                throw new Error(`API 请求失败，状态码: ${response.status}`);
            }

            const result = await response.json();
            if (!result.success || !result.data || result.data.length === 0) {
                if (page === 1) throw new Error('API未返回任何数据');
                // If not the first page, it's a normal end of data.
                loadMoreKey = null; 
            } else {
                 if (page === 1) {
                    authorName = result.data[0]?.user?.screenName || username;
                }
                allPosts = allPosts.concat(result.data);
                loadMoreKey = result.loadMoreKey;
                page++;
                updateStatus(`已获取 ${allPosts.length} 条笔记...`);
            }

        } catch (error) {
            console.error('爬取时出错:', error);
            updateStatus(`错误: ${error.message}`, false, true);
            return;
        }
    } while (loadMoreKey);

    if (allPosts.length > 0) {
        updateStatus(`爬取完成，共 ${allPosts.length} 条笔记！`);
        generateCSV(allPosts, includeImages);
        updateStatus('数据处理完成，可以下载了！', true);
    } else {
        updateStatus('未找到任何笔记或数据为空。', false, true);
    }
}


function generateCSV(data, includeImages) {
    const headers = ['发布时间', '内容', '频道', '点赞数', '评论数', '转发数'];
    if (includeImages) {
        headers.push('图片链接');
    }

    const rows = data.map(post => {
        const row = [
            new Date(post.createdAt).toLocaleString('zh-CN', { hour12: false }),
            `"${(post.content || '').replace(/"/g, '""')}"`,
            post.topic ? `"${post.topic.content}"` : '无',
            post.likeCount,
            post.commentCount,
            post.repostCount,
        ];
        if (includeImages) {
            const imageUrls = (post.pictures || []).map(p => p.picUrl).join(' , ');
            row.push(`"${imageUrls}"`);
        }
        return row.join(',');
    });

    csvData = [headers.join(','), ...rows].join('\n');
}

// ==========================================================
//  ↓↓↓  THIS IS THE CORRECTED FUNCTION  ↓↓↓
// ==========================================================
async function downloadCSV() {
    if (!csvData) return;

    const blob = new Blob([`\uFEFF${csvData}`], { type: 'text/csv;charset=utf-8;' });
    
    // Use FileReader to convert the Blob to a Data URL
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    const dataUrl = await new Promise(resolve => {
        reader.onload = () => resolve(reader.result);
    });

    const today = new Date();
    const dateString = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
    const filename = `${authorName}_${dateString}.csv`;

    chrome.downloads.download({
        url: dataUrl, // Use the Data URL instead of a Blob URL
        filename: filename,
        saveAs: true
    });
}