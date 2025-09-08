// popup.js
const startButton = document.getElementById('start-button');
const statusDiv = document.getElementById('status');
const includeImagesCheckbox = document.getElementById('include-images');
const activationCodeInput = document.getElementById('activation-code');
const activateButton = document.getElementById('activate-button');
const activationStatusDiv = document.getElementById('activation-status');
const goJikeButton = document.getElementById('go-jike-button');
const openUserPageButton = document.getElementById('open-user-page-button');
const helpButton = document.getElementById('help-button');

// 硬编码的激活码
const ACTIVATION_CODE = 'JIKE2024PREMIUM';
const LIMIT_WITHOUT_ACTIVATION = 60;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 使用Promise.all同时执行，但不阻塞
    Promise.all([
        checkActivationStatus(),
        checkCurrentPage()
    ]).catch(error => {
        console.error('初始化失败:', error);
        statusDiv.textContent = '初始化失败';
    });
});

// 检查激活状态
async function checkActivationStatus() {
    try {
        if (!chrome.storage || !chrome.storage.local) {
            console.error('Chrome storage API 不可用');
            return;
        }
        
        const result = await chrome.storage.local.get(['isActivated']);
        if (result && result.isActivated) {
            activationStatusDiv.textContent = '已激活';
            activationStatusDiv.style.color = '#4CAF50';
            activationCodeInput.style.display = 'none';
            activateButton.style.display = 'none';
        }
    } catch (error) {
        console.error('检查激活状态失败:', error);
    }
}

// 检查当前页面
async function checkCurrentPage() {
    try {
        // 确保chrome.tabs API可用
        if (!chrome.tabs || !chrome.tabs.query) {
            console.error('Chrome tabs API 不可用');
            showDefaultState();
            return;
        }

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0 || !tabs[0]) {
            console.error('无法获取当前标签页');
            showDefaultState();
            return;
        }
        
        const tab = tabs[0];
        const url = tab.url || '';
        
        if (url.includes('web.okjike.com')) {
            // 在即刻相关页面
            if (url.includes('/u/') && (url.includes('/collection') || url.match(/\/u\/[^\/]+\/?$/))) {
                // 在用户详情页或收藏页，显示正常功能
                showNormalState();
            } else {
                // 在即刻但不是用户详情页或收藏页
                showUserPageState();
            }
        } else {
            // 不在即刻页面
            showGoToJikeState();
        }
    } catch (error) {
        console.error('检查页面失败:', error);
        showDefaultState();
    }
}

// 显示状态的辅助函数
function showDefaultState() {
    goJikeButton.style.display = 'block';
    openUserPageButton.style.display = 'none';
    startButton.style.display = 'none';
    statusDiv.textContent = '无法检测当前页面';
}

function showNormalState() {
    goJikeButton.style.display = 'none';
    openUserPageButton.style.display = 'none';
    startButton.style.display = 'block';
    statusDiv.textContent = '准备就绪';
}

function showUserPageState() {
    goJikeButton.style.display = 'none';
    openUserPageButton.style.display = 'block';
    startButton.style.display = 'none';
    statusDiv.textContent = '请打开一个用户主页';
}

function showGoToJikeState() {
    goJikeButton.style.display = 'block';
    openUserPageButton.style.display = 'none';
    startButton.style.display = 'none';
    statusDiv.textContent = '请先前往即刻网站';
}

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

// 激活按钮点击
activateButton.onclick = async () => {
    try {
        const inputCode = activationCodeInput.value.trim();
        if (inputCode === ACTIVATION_CODE) {
            await chrome.storage.local.set({ isActivated: true });
            activationStatusDiv.textContent = '激活成功！';
            activationStatusDiv.style.color = '#4CAF50';
            activationCodeInput.style.display = 'none';
            activateButton.style.display = 'none';
            statusDiv.textContent = '已激活，无数量限制';
        } else {
            activationStatusDiv.textContent = '激活码错误';
            activationStatusDiv.style.color = '#f44336';
            setTimeout(() => {
                activationStatusDiv.textContent = '未激活 (限制60条)';
                activationStatusDiv.style.color = '#666';
            }, 2000);
        }
    } catch (error) {
        console.error('激活失败:', error);
        activationStatusDiv.textContent = '激活失败';
        activationStatusDiv.style.color = '#f44336';
    }
};

// 去即刻按钮
goJikeButton.onclick = () => {
    chrome.tabs.create({ url: 'https://web.okjike.com' });
};

// 打开用户主页按钮
openUserPageButton.onclick = () => {
    const username = prompt('请输入用户名 (例如: username):');
    if (username) {
        chrome.tabs.create({ url: `https://web.okjike.com/u/${username}` });
    }
};

// 获取激活码按钮
helpButton.onclick = () => {
    chrome.tabs.create({ url: 'https://y058g7qb3et.feishu.cn/wiki/R8oDwxYK2it5cMki1Hkc7Mc3n5g?from=from_copylink' });
};

// 开始爬取按钮
startButton.onclick = async () => {
    startButton.disabled = true;
    statusDiv.textContent = '正在获取页面信息...';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 使用 scripting API 在页面上执行脚本，获取所需信息
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const path = window.location.pathname;
                const pathParts = path.split('/');
                const token = localStorage.getItem('JK_ACCESS_TOKEN');
                
                // 检查是否为收藏页面
                const isCollection = path.includes('/collection');
                let username = '';
                
                if (isCollection) {
                    // 收藏页面: /u/user-id/collection
                    username = pathParts[2]; // 获取用户ID
                } else {
                    // 普通用户页面: /u/username
                    username = pathParts[2] || pathParts.pop();
                }
                
                return { username, token, isCollection };
            },
        });

        const { username, token, isCollection } = results[0].result;
        const includeImages = includeImagesCheckbox.checked;

        if (!token) {
            statusDiv.textContent = '错误：无法获取Token，请先登录即刻';
            startButton.disabled = false;
            return;
        }

        // 检查激活状态
        const activationResult = await chrome.storage.local.get(['isActivated']);
        const isActivated = activationResult.isActivated || false;

        // 发送消息到 background.js 开始爬取
        chrome.runtime.sendMessage({
            type: 'start_crawl',
            payload: { username, token, includeImages, isActivated, isCollection }
        });
        statusDiv.textContent = '已发送爬取任务，请稍候...';

    } catch (error) {
        console.error('插件错误:', error);
        statusDiv.textContent = `发生错误: ${error.message}`;
        startButton.disabled = false;
    }
};