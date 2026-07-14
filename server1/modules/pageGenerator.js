const fs = require('fs');
const path = require('path');

class PageGenerator {
    constructor(pagesDir, publicDir) {
        this.pagesDir = pagesDir;
        this.publicDir = publicDir;
        this.pages = [];
        this.lastUpdate = null;
    }
    
    generate() {
        this._scanPages();
        this._generateIndexHtml();
        this._generatePagesList();
        return this.pages;
    }
    
    getPages() {
        return this.pages;
    }
    
    _scanPages() {
        if (!fs.existsSync(this.pagesDir)) {
            fs.mkdirSync(this.pagesDir, { recursive: true });
            return;
        }
        
        const files = fs.readdirSync(this.pagesDir);
        this.pages = [];
        
        for (const file of files) {
            if (file.endsWith('.html') && file !== 'list.json') {
                const filePath = path.join(this.pagesDir, file);
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    
                    let title = path.basename(file, '.html');
                    let description = '';
                    let icon = '📄';
                    
                    const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
                    if (titleMatch) {
                        title = titleMatch[1].trim();
                    }
                    
                    const descMatch = content.match(/<h[1-6][^>]*>.*?<\/h[1-6]>.*?<p[^>]*>([^<]*)<\/p>/is);
                    if (descMatch) {
                        description = descMatch[1].trim();
                    }
                    
                    const iconMatch = content.match(/<!--\s*icon:\s*([^\s]+)\s*-->/i);
                    if (iconMatch) {
                        icon = iconMatch[1];
                    }
                    
                    this.pages.push({
                        name: path.basename(file, '.html'),
                        file: file,
                        title: title,
                        description: description || 'Нет описания',
                        icon: icon,
                        path: `/pages/${file}`
                    });
                    
                } catch (e) {
                    console.error(`Error reading page ${file}:`, e);
                }
            }
        }
        
        this.pages.sort((a, b) => a.title.localeCompare(b.title));
        this.lastUpdate = new Date();
    }
    
    _generateIndexHtml() {
        const html = this._buildIndexHtml();
        const indexPath = path.join(this.publicDir, 'index.html');
        
        if (!fs.existsSync(this.publicDir)) {
            fs.mkdirSync(this.publicDir, { recursive: true });
        }
        
        fs.writeFileSync(indexPath, html, 'utf8');
    }
    
    _generatePagesList() {
        const listPath = path.join(this.pagesDir, 'list.json');
        fs.writeFileSync(listPath, JSON.stringify(this.pages, null, 2), 'utf8');
    }
    
    _buildIndexHtml() {
        const pageCards = this.pages.map(page => `
            <div class="page-card" data-page="${page.name}">
                <div class="page-icon">${page.icon}</div>
                <div class="page-info">
                    <h3>${page.title}</h3>
                    <p>${page.description}</p>
                </div>
                <button class="open-page-btn" data-url="${page.path}">
                    Открыть
                </button>
            </div>
        `).join('');
        
        return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Z-397 Конвертер Менеджер - Главная</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 40px 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            color: white;
            margin-bottom: 40px;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        
        .header .update-info {
            font-size: 0.9rem;
            opacity: 0.7;
            margin-top: 10px;
        }
        
        .controls {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 20px;
            gap: 10px;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: 500;
        }
        
        .btn-primary {
            background: white;
            color: #667eea;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        .pages-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 20px;
        }
        
        .page-card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }
        
        .page-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 30px rgba(0,0,0,0.15);
        }
        
        .page-icon {
            font-size: 3rem;
            margin-bottom: 12px;
        }
        
        .page-info h3 {
            color: #333;
            font-size: 1.2rem;
            margin-bottom: 8px;
        }
        
        .page-info p {
            color: #666;
            font-size: 0.95rem;
            line-height: 1.4;
            margin-bottom: 16px;
        }
        
        .open-page-btn {
            padding: 8px 20px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: 500;
        }
        
        .open-page-btn:hover {
            background: #5a67d8;
            transform: scale(1.05);
        }
        
        .empty-state {
            grid-column: 1 / -1;
            text-align: center;
            color: white;
            padding: 60px 20px;
        }
        
        .empty-state h2 {
            font-size: 2rem;
            margin-bottom: 10px;
        }
        
        .empty-state p {
            font-size: 1.1rem;
            opacity: 0.9;
        }
        
        .footer {
            text-align: center;
            color: white;
            margin-top: 40px;
            opacity: 0.7;
        }
        
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            background: rgba(255,255,255,0.2);
            border-radius: 12px;
            font-size: 0.8rem;
            color: white;
            margin-top: 8px;
        }
        
        .toast {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: #1f2937;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
            z-index: 1000;
        }
        
        .toast.show {
            opacity: 1;
            transform: translateY(0);
        }
        
        .toast.success {
            background: #10b981;
        }
        
        .toast.error {
            background: #ef4444;
        }
        
        @media (max-width: 640px) {
            .header h1 {
                font-size: 1.8rem;
            }
            
            .pages-grid {
                grid-template-columns: 1fr;
            }
            
            .controls {
                justify-content: center;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Z-397 Конвертер Менеджер</h1>
            <p>Управление конвертерами и контроллерами</p>
            <div class="update-info" id="updateInfo">
                Страниц: ${this.pages.length} | Обновлено: ${this.lastUpdate ? this.lastUpdate.toLocaleString() : 'только что'}
            </div>
        </div>
        
        <div class="controls">
            <button class="btn btn-primary" onclick="refreshPages()">🔄 Обновить список</button>
        </div>
        
        <div class="pages-grid" id="pagesGrid">
            ${this.pages.length > 0 ? pageCards : `
                <div class="empty-state">
                    <h2>📂 Нет страниц</h2>
                    <p>Добавьте HTML страницы в папку <strong>pages</strong></p>
                </div>
            `}
        </div>
        
        <div class="footer">
            <span class="status-badge">● Система работает</span>
        </div>
    </div>
    
    <div class="toast" id="toast"></div>
    
    <script>
        function openPage(url) {
            window.open(url, '_blank');
        }
        
        function showToast(message, type) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast ' + (type || 'success') + ' show';
            setTimeout(function() {
                toast.classList.remove('show');
            }, 3000);
        }
        
        function loadPages() {
            fetch('/api', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api: 'pageGenerator',
                    cmd: 'list',
                    data: {}
                })
            })
            .then(function(response) {
                return response.json();
            })
            .then(function(data) {
                if (data.success) {
                    renderPages(data.result.pages);
                    document.getElementById('updateInfo').textContent = 
                        'Страниц: ' + data.result.count + ' | Обновлено: ' + new Date().toLocaleString();
                } else {
                    showToast('Ошибка загрузки: ' + (data.error || 'неизвестная ошибка'), 'error');
                }
            })
            .catch(function(err) {
                showToast('Ошибка запроса: ' + err.message, 'error');
            });
        }
        
        function refreshPages() {
            fetch('/api', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api: 'pageGenerator',
                    cmd: 'generate',
                    data: {}
                })
            })
            .then(function(response) {
                return response.json();
            })
            .then(function(data) {
                if (data.success) {
                    renderPages(data.result.pages);
                    document.getElementById('updateInfo').textContent = 
                        'Страниц: ' + data.result.count + ' | Обновлено: ' + new Date().toLocaleString();
                    showToast('Страницы обновлены: ' + data.result.count + ' страниц', 'success');
                } else {
                    showToast('Ошибка обновления: ' + (data.error || 'неизвестная ошибка'), 'error');
                }
            })
            .catch(function(err) {
                showToast('Ошибка запроса: ' + err.message, 'error');
            });
        }
        
        function renderPages(pages) {
            var grid = document.getElementById('pagesGrid');
            
            if (!pages || pages.length === 0) {
                grid.innerHTML = 
                    '<div class="empty-state">' +
                        '<h2>📂 Нет страниц</h2>' +
                        '<p>Добавьте HTML страницы в папку <strong>pages</strong></p>' +
                    '</div>';
                return;
            }
            
            var html = '';
            for (var i = 0; i < pages.length; i++) {
                var page = pages[i];
                html += 
                    '<div class="page-card" data-page="' + page.name + '">' +
                        '<div class="page-icon">' + (page.icon || '📄') + '</div>' +
                        '<div class="page-info">' +
                            '<h3>' + page.title + '</h3>' +
                            '<p>' + (page.description || 'Нет описания') + '</p>' +
                        '</div>' +
                        '<button class="open-page-btn" data-url="' + page.path + '">' +
                            'Открыть' +
                        '</button>' +
                    '</div>';
            }
            grid.innerHTML = html;
            
            var buttons = document.querySelectorAll('.open-page-btn');
            for (var j = 0; j < buttons.length; j++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var url = this.getAttribute('data-url');
                        if (url) {
                            window.open(url, '_blank');
                        }
                    });
                })(buttons[j]);
            }
        }
        
        document.addEventListener('DOMContentLoaded', function() {
            var buttons = document.querySelectorAll('.open-page-btn');
            for (var i = 0; i < buttons.length; i++) {
                (function(btn) {
                    btn.removeAttribute('onclick');
                    btn.addEventListener('click', function() {
                        var url = this.getAttribute('data-url');
                        if (url) {
                            window.open(url, '_blank');
                        }
                    });
                })(buttons[i]);
            }
            
            loadPages();
        });
    </script>
</body>
</html>`;
    }
}

module.exports = PageGenerator;