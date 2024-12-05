/** @type {import('tailwindcss').Config} */
import flowbitePlugin from 'flowbite/plugin';

export default {
  content:  ["./src/**/*.{vue, js, ts, tsx}","./src/*.{vue, js, ts, tsx}", "./index.html", "./node_modules/flowbite/**/*.js"],
  theme: {
    extend: {
      /* IMPORTANT:ADMINFORTH TAILWIND STYLES */
  }
  },

  darkMode: 'class',
  plugins: [
    flowbitePlugin({
      charts: true,
    }),
  ],
}

