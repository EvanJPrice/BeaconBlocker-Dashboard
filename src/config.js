// config.js - Dashboard Environment Configuration
// Uses Vite's built-in import.meta.env.DEV to detect environment

const config = {
    BACKEND_URL: import.meta.env.DEV
        ? 'http://localhost:3000'
        : 'https://api.beaconblocker.com',
};

export default config;
