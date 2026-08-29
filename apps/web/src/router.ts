import { createRouter, createWebHistory } from "vue-router";
import LandingPage from "@/pages/LandingPage.vue";
import CaseIntakePage from "@/pages/CaseIntakePage.vue";
import CaseWorkspacePage from "@/pages/CaseWorkspacePage.vue";
import IndicatorCatalogPage from "@/pages/IndicatorCatalogPage.vue";
import SharedIndicatorPage from "@/pages/SharedIndicatorPage.vue";
import SharedReportPage from "@/pages/SharedReportPage.vue";
import AuthPage from "@/pages/AuthPage.vue";
import { authClient, safeAuthRedirect } from "@/services/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: LandingPage },
    { path: "/auth", name: "auth", component: AuthPage },
    { path: "/new", name: "new-case", component: CaseIntakePage, meta: { requiresAuth: true } },
    { path: "/case/:caseId", name: "case", component: CaseWorkspacePage, meta: { requiresAuth: true } },
    { path: "/indicators", name: "indicators", component: IndicatorCatalogPage, meta: { requiresAuth: true } },
    { path: "/indicator/:token", name: "indicator", component: SharedIndicatorPage },
    { path: "/report/:token", name: "report", component: SharedReportPage },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  if (to.name !== "auth" && !to.meta.requiresAuth) return true;

  try {
    const { data: session } = await authClient.getSession();
    if (to.meta.requiresAuth && !session?.user) {
      return { name: "auth", query: { redirect: to.fullPath } };
    }
    if (to.name === "auth" && session?.user) {
      return safeAuthRedirect(to.query.redirect);
    }
  } catch {
    if (to.meta.requiresAuth) return { name: "auth", query: { redirect: to.fullPath } };
  }

  return true;
});

export default router;
