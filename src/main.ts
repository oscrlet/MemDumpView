import { createApp } from 'vue'
import { createPinia } from 'pinia' // Import createPinia
import './style.css'
import App from './App.vue'

// Create Pinia instance
const pinia = createPinia()
const app = createApp(App)

// Use Pinia instance in Vue app
app.use(pinia)

app.mount('#app')
