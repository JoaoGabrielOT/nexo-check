import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router';
import { CheckinPage } from '../features/checkin';
import { ArticlePage, LearnPage } from '../features/learn';
import { LogPage } from '../features/log';
import { OnboardingPage, ReconsentPage } from '../features/onboarding';
import { ProgressPage } from '../features/progress';
import { ProjectPage, QuestionnairePage } from '../features/project';
import { SettingsPage } from '../features/settings';
import { TodayPage } from '../features/today';
import { Layout } from './layout';

const AdminRoutes = lazy(() => import('../features/admin/AdminRoutes'));

// O admin só existe na web; nos apps nativos (Tauri) a rota nem é registrada.
const adminRoutes: RouteObject[] = import.meta.env.TAURI_ENV_PLATFORM
  ? []
  : [
      {
        path: 'admin/*',
        element: (
          <Suspense fallback={null}>
            <AdminRoutes />
          </Suspense>
        ),
      },
    ];

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'registro', element: <LogPage /> },
      { path: 'progresso', element: <ProgressPage /> },
      { path: 'aprender', element: <LearnPage /> },
      { path: 'aprender/:section/:slug', element: <ArticlePage /> },
      { path: 'projeto', element: <ProjectPage /> },
      { path: 'projeto/questionario/:kind', element: <QuestionnairePage /> },
      { path: 'checkin', element: <CheckinPage /> },
      { path: 'config', element: <SettingsPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
      { path: 'onboarding/consentimento', element: <ReconsentPage /> },
      ...adminRoutes,
    ],
  },
];
