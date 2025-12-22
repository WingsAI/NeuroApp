import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cardinal: {
          50: '#fdf2f2',
          100: '#fde4e4',
          200: '#fbcfcf',
          300: '#f7abab',
          400: '#ef7a7a',
          500: '#e14d4d',
          600: '#ca3535',
          700: '#8C1515', // Original Stanford Cardinal
          800: '#8e2727',
          900: '#762525',
          950: '#400f0f',
        },
        sandstone: {
          50: '#faf9f7',
          100: '#f4f2ee',
          200: '#e1ddd4',
          300: '#cdc6b6',
          400: '#b1a792',
          500: '#9b8d76',
          600: '#8b7a67',
          700: '#746456',
          800: '#5e5248',
          900: '#4e453e',
          950: '#292421',
        },
        charcoal: '#2E2D29',
        primary: {
          50: '#fdf2f2',
          100: '#fde4e4',
          200: '#fbcfcf',
          300: '#f7abab',
          400: '#ef7a7a',
          500: '#e14d4d',
          600: '#ca3535',
          700: '#8C1515', // Mapping primary to Cardinal
          800: '#8e2727',
          900: '#762525',
        },
      },
      fontFamily: {
        serif: ['var(--font-playfair)', 'serif'],
        sans: ['var(--font-outfit)', 'sans-serif'],
      },
      boxShadow: {
        'premium': '0 10px 40px -10px rgba(0, 0, 0, 0.05)',
        'premium-hover': '0 20px 60px -15px rgba(140, 21, 21, 0.1)',
      },
    },
  },
  plugins: [],
};

export default config;

