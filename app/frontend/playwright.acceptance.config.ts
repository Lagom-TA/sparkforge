import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/acceptance', workers:1, timeout:60000,
 use:{baseURL:'http://127.0.0.1:4319'},
 webServer:{command:'BACKEND_PORT=8019 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4319',url:'http://127.0.0.1:4319',reuseExistingServer:false},
});
