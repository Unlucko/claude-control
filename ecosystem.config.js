require('dotenv/config');

module.exports = {
  apps: [
    {
      name: 'claude-control',
      script: 'npx',
      args: 'ts-node server/index.ts',
      cwd: __dirname,
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 4000,
        CONTROL_TOKEN: process.env.CONTROL_TOKEN,
        VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
        VAPID_EMAIL: process.env.VAPID_EMAIL,
      },
    },
  ],
};
