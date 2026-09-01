import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "@/App.vue";
import router from "@/router";
import { motionReveal } from "@/directives/motionReveal";
import "@/styles/main.scss";
import "@/styles/motion.scss";

createApp(App)
  .directive("motion-reveal", motionReveal)
  .use(createPinia())
  .use(router)
  .mount("#app");
