import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:'*.spec.ts',use:{baseURL:'http://localhost:3000',headless:true,launchOptions:{executablePath:'/usr/bin/chromium',args:['--no-sandbox']}},workers:1,reporter:'list'});
