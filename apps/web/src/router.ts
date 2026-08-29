import { createRouter, createWebHistory } from "vue-router";
import { authClient, safeAuthRedirect } from "@/services/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: () => import("@/pages/LandingPage.vue") },
    { path: "/auth", name: "auth", component: () => import("@/pages/AuthPage.vue") },
    { path: "/new", name: "new-case", component: () => import("@/pages/CaseIntakePage.vue"), meta: { requiresAuth: true } },
    { path: "/case/:caseId", name: "case", component: () => import("@/pages/CaseWorkspacePage.vue"), meta: { requiresAuth: true } },
    { path: "/indicators", name: "indicators", component: () => import("@/pages/IndicatorCatalogPage.vue"), meta: { requiresAuth: true } },
    { path: "/indicator/:token", name: "indicator", component: () => import("@/pages/SharedIndicatorPage.vue") },
    { path: "/report/:token", name: "report", component: () => import("@/pages/SharedReportPage.vue") },
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
