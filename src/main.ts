import { createApp } from 'vue';
import { createPinia } from 'pinia';
import VueKonva from 'vue-konva';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-serif-sc';
import '@fontsource/ma-shan-zheng/400.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import App from './App.vue';
import './styles.css';

createApp(App).use(createPinia()).use(VueKonva).mount('#app');
