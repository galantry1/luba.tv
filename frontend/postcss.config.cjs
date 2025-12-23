// Local PostCSS config to prevent Vite from picking up any parent/global Tailwind config.
// This project does NOT use Tailwind.
module.exports = {
  plugins: {
    autoprefixer: {},
  },
};
