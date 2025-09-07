// popup.js
const startButton = document.getElementById('start-button');
const statusDiv = document.getElementById('status');
const includeImagesCheckbox = document.getElementById('include-images');

// 监听后台脚本发送的状态更新
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'status_update') {
        statusDiv.textContent = message.text;
        if (message.done) {
            startButton.disabled = false;
            startButton.textContent = '下载CSV文件';
            startButton.onclick = () => {
                chrome.runtime.sendMessage({ type: 'download_csv' });
            };
        }
        if (message.error) {
            startButton.disabled = false;
            startButton.textContent = '开始爬取';
        }
    }
});


startButton.onclick = async () => {
    startButton.disabled = true;
    statusDiv.textContent = '正在获取页面信息...';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 使用 scripting API 在页面上执行脚本，获取所需信息
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const username = window.location.pathname.split('/').pop();
                const token = localStorage.getItem('JK_ACCESS_TOKEN');
                return { username, token };
            },
        });

        const { username, token } = results[0].result;
        const includeImages = includeImagesCheckbox.checked;

        if (!token) {
            statusDiv.textContent = '错误：无法获取Token，请先登录即刻';
            startButton.disabled = false;
            return;
        }

        // 发送消息到 background.js 开始爬取
        chrome.runtime.sendMessage({
            type: 'start_crawl',
            payload: { username, token, includeImages }
        });
        statusDiv.textContent = '已发送爬取任务，请稍候...';

    } catch (error) {
        console.error('插件错误:', error);
        statusDiv.textContent = `发生错误: ${error.message}`;
        startButton.disabled = false;
    }
};