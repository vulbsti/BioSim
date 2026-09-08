import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',timeout:45000,use:{baseURL:'http://localhost:3016',headless:true,viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'},webServer:{command:'npm run dev',url:'http://localhost:3016',reuseExistingServer:true},workers:2});
