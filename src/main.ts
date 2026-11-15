import './app';
import { startBackground } from './background';
import { formatReport, runRoundTrip } from './selftest';
import { APP_VERSION, BUILD_NUMBER } from './version';

function paintBuildBadge(): void {
  const dock = document.getElementById('dock-build');
  if (dock) dock.textContent = `v${APP_VERSION} · build ${BUILD_NUMBER}`;

  document.documentElement.dataset.build = BUILD_NUMBER;
}

// Console access for verification: await __gmoResumeTest() prints a full report.
(window as unknown as Record<string, unknown>).__gmoResumeTest = async () => {
  const report = await runRoundTrip();
  console.log(formatReport(report));
  return report;
};

paintBuildBadge();
startBackground();
