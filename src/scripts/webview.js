import { EventEmitter } from 'events';
import servers from './servers';
import sidebar from './sidebar';
import { shell, desktopCapturer, ipcRenderer } from 'electron';
const $ = require('./vendor/jquery-3.1.1');

class WebView extends EventEmitter {
    constructor () {
        super();

        this.webviewParentElement = document.body;

        servers.forEach((host) => {
            this.add(host);
        });

        servers.on('host-added', (hostUrl) => {
            this.add(servers.get(hostUrl));
        });

        servers.on('host-removed', (hostUrl) => {
            this.remove(hostUrl);
        });

        servers.on('active-setted', (hostUrl) => {
            this.setActive(hostUrl);
        });

        servers.on('active-cleared', (hostUrl) => {
            this.deactiveAll(hostUrl);
        });

        servers.once('loaded', () => {
            this.loaded();
        });

        ipcRenderer.on('screenshare-result', (e, result) => {
            const webviewObj = this.getActive();
            webviewObj.executeJavaScript(`
                window.parent.postMessage({
                    sourceId: '${result}'
                }, '*')
            `);
        });
    }

    loaded () {
        var loading = document.querySelector('#loading');
        var form = document.querySelector('#login-card');
        var footer = document.querySelector('footer');
        loading.style.display = 'none';
        form.style.display = 'block';
        footer.style.display = 'block';
    }

    add (host) {
        var webviewObj = this.getByUrl(host.url);
        if (webviewObj) {
            return;
        }

        webviewObj = document.createElement('webview');
        webviewObj.setAttribute('server', host.url);
        webviewObj.setAttribute('preload', './preload.js');
        webviewObj.setAttribute('allowpopups', 'on');
        webviewObj.setAttribute('disablewebsecurity', 'on');

        webviewObj.addEventListener('did-navigate-in-page', (lastPath) => {
            this.saveLastPath(host.url, lastPath.url);
        });

        webviewObj.addEventListener('console-message', function (e) {
            console.log('webview:', e.message);
        });

        webviewObj.addEventListener('ipc-message', (event) => {
            this.emit('ipc-message-'+event.channel, host.url, event.args);

            switch (event.channel) {
                case 'title-changed':
                    servers.setHostTitle(host.url, event.args[0]);
                    break;
                case 'unread-changed':
                    sidebar.setBadge(host.url, event.args[0]);
                    break;
                case 'focus':
                    servers.setActive(host.url);
                    break;
                case 'get-sourceId':
                    desktopCapturer.getSources({types: ['window', 'screen']}, (error, sources) => {
                        if (error) {
                            throw error;
                        }

                        sources = sources.map(source => {
                            source.thumbnail = source.thumbnail.toDataURL();
                            return source;
                        });
                        ipcRenderer.send('screenshare', sources);
                    });
                    break;
            }
        });

        webviewObj.addEventListener('dom-ready', () => {
            this.emit('dom-ready', host.url);
            this.loaded(host);
            // webviewObj.openDevTools();
        });

        this.webviewParentElement.appendChild(webviewObj);

        webviewObj.src = host.lastPath || host.url;
    }

    remove (hostUrl) {
        var el = this.getByUrl(hostUrl);
        if (el) {
            el.remove();
        }
    }

    saveLastPath (hostUrl, lastPathUrl) {
        var hosts = servers.hosts;
        hosts[hostUrl].lastPath = lastPathUrl;
        servers.hosts = hosts;
    }

    getByUrl (hostUrl) {
        return this.webviewParentElement.querySelector(`webview[server="${hostUrl}"]`);
    }

    getActive () {
                return document.querySelector('webview.active');
    }

    isActive (hostUrl) {
        return !!this.webviewParentElement.querySelector(`webview.active[server="${hostUrl}"]`);
    }

    deactiveAll () {
        var item;
        while (!(item = this.getActive()) === false) {
            item.classList.remove('active');
        }
    }

    setActive (hostUrl) {
        console.log('active setted', hostUrl);
        if (this.isActive(hostUrl)) {
            return;
        }

        this.deactiveAll();
        var item = this.getByUrl(hostUrl);
        if (item) {
            item.classList.add('active');
        }

        this.focusActive();
    }

    focusActive () {
        var active = this.getActive();
        if (active) {
            active.focus();
            return true;
        }
        return false;
    }
}

export default new WebView();
