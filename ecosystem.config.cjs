module.exports = {
  apps: [
    {
      name: "ittop-buffet-bot",
      script: "src/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_restarts: 50,
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
