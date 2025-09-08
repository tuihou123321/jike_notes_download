// background.js (Corrected Version)

let csvData = null;
let authorName = '';
let crawlInProgress = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'start_crawl' && !crawlInProgress) {
        crawlInProgress = true;
        const { username, token, includeImages, isActivated, isCollection } = message.payload;
        fetchAllPages(username, token, includeImages, isActivated, isCollection)
            .catch(err => console.error("爬取失败:", err))
            .finally(() => {
                crawlInProgress = false;
            });
        return true; // Indicates that the response is sent asynchronously
    } else if (message.type === 'download_csv' && csvData) {
        downloadCSV(); // This function is now async, but the call remains the same
    }
});

async function fetchAllPages(username, token, includeImages, isActivated, isCollection) {
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
            
            // 根据页面类型选择不同的API端点和请求体
            let apiUrl, requestBody;
            if (isCollection) {
                // 收藏页面使用正确的收藏API
                apiUrl = 'https://api.ruguoapp.com/1.0/collections/list';
                requestBody = {
                    limit: 20
                };
                // 收藏API如果支持分页，添加loadMoreKey
                if (loadMoreKey) {
                    requestBody.loadMoreKey = loadMoreKey;
                }
            } else {
                // 普通个人页面
                apiUrl = 'https://api.ruguoapp.com/1.0/personalUpdate/single';
                requestBody = {
                    username: username,
                    limit: 20,
                    loadMoreKey: loadMoreKey,
                };
            }
            
            const headers = {
                'Content-Type': 'application/json',
                'x-jike-access-token': token,
            };
            
            // 为收藏API添加额外的请求头
            if (isCollection) {
                headers['accept'] = 'application/json, text/plain, */*';
                headers['origin'] = 'https://web.okjike.com';
                headers['sec-fetch-dest'] = 'empty';
                headers['sec-fetch-mode'] = 'cors';
                headers['sec-fetch-site'] = 'cross-site';
            }
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const responseText = await response.text();
                console.error(`API请求失败详情:`, {
                    status: response.status,
                    url: apiUrl,
                    body: requestBody,
                    responseText: responseText,
                    isCollection: isCollection,
                    username: username
                });
                
                // 如果是收藏页面404，尝试其他API端点
                if (isCollection && response.status === 404) {
                    console.log('收藏API失败，尝试使用personalUpdate API');
                    // 降级到使用普通API，但可能数据不对
                    throw new Error(`收藏API不可用 (${response.status})，请检查API端点是否正确`);
                }
                
                throw new Error(`API 请求失败，状态码: ${response.status}${isCollection ? ' (收藏页面)' : ' (普通页面)'}`);
            }

            const result = await response.json();
            
            // 添加调试日志查看API响应结构
            if (isCollection && page === 1) {
                console.log('收藏API响应结构:', JSON.stringify(result, null, 2));
                console.log('响应字段:', Object.keys(result));
                if (result.data) {
                    console.log('data字段类型:', typeof result.data, '长度:', result.data?.length);
                }
            }
            
            // 收藏API和个人动态API的响应结构不同
            let hasData, posts, nextLoadMoreKey;
            
            if (isCollection) {
                // 收藏API: 直接返回 {data: [...], loadMoreKey: {...}}
                hasData = result.data && result.data.length > 0;
                posts = result.data || [];
                nextLoadMoreKey = result.loadMoreKey;
            } else {
                // 个人动态API: 返回 {success: true, data: [...], loadMoreKey: "..."}
                hasData = result.success && result.data && result.data.length > 0;
                posts = result.data || [];
                nextLoadMoreKey = result.loadMoreKey;
            }
            
            if (!hasData) {
                if (page === 1) {
                    console.error('API响应详情:', result);
                    throw new Error(`API未返回任何数据 - ${isCollection ? 'collection' : 'personal'} API`);
                }
                // If not the first page, it's a normal end of data.
                loadMoreKey = null; 
            } else {
                if (page === 1 && posts.length > 0) {
                    // 获取作者名称，收藏页面显示收藏者名称
                    if (isCollection) {
                        authorName = `收藏_${username}`;
                    } else {
                        authorName = posts[0]?.user?.screenName || username;
                    }
                }
                
                // 如果未激活，检查是否会超过60条限制
                if (!isActivated && allPosts.length + posts.length > 60) {
                    const remainingSlots = 60 - allPosts.length;
                    allPosts = allPosts.concat(posts.slice(0, remainingSlots));
                    updateStatus(`未激活用户限制60条笔记，已获取 ${allPosts.length} 条笔记`);
                    break;
                } else {
                    allPosts = allPosts.concat(posts);
                    
                    // 如果未激活且正好达到60条，也要停止
                    if (!isActivated && allPosts.length >= 60) {
                        updateStatus(`未激活用户限制60条笔记，已获取 ${allPosts.length} 条笔记`);
                        break;
                    }
                }
                
                loadMoreKey = nextLoadMoreKey;
                page++;
                const pageType = isCollection ? '收藏' : '笔记';
                updateStatus(`已获取 ${allPosts.length} 条${pageType}...${!isActivated ? ' (未激活限制60条)' : ''}`);
            }

        } catch (error) {
            console.error('爬取时出错:', error);
            updateStatus(`错误: ${error.message}`, false, true);
            return;
        }
    } while (loadMoreKey);

    if (allPosts.length > 0) {
        const pageType = isCollection ? '收藏' : '笔记';
        const statusMessage = `爬取完成，共 ${allPosts.length} 条${pageType}！${!isActivated && allPosts.length >= 60 ? ' (未激活限制)' : ''}`;
        updateStatus(statusMessage);
        generateCSV(allPosts, includeImages);
        updateStatus('数据处理完成，可以下载了！', true);
    } else {
        const pageType = isCollection ? '收藏' : '笔记';
        updateStatus(`未找到任何${pageType}或数据为空。`, false, true);
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