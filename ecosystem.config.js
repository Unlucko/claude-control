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
      },
    },
  ],
};
