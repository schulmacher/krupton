module.exports = {
  apps: [
    {
      name: 'packages-build',
      script: 'pnpm',
      args: 'dev:deps',
      cwd: '/Users/e/taltech/loputoo/start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};

