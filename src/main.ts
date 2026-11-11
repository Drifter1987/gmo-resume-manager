import './app';
import { startBackground } from './background';
import { APP_VERSION, BUILD_NUMBER } from './version';

function paintBuildBadge(): void {
  const dock = document.getElementById('dock-build');
  if (dock) dock.textContent = `v${APP_VERSION} · build ${BUILD_NUMBER}`;

  const meta = document.getElementById('footer-meta');
  if (meta) {
    meta.innerHTML = `<span class="chip">v${APP_VERSION}</span><span class="chip is-build">build ${BUILD_NUMBER}</span>`;
  }

  document.documentElement.dataset.build = BUILD_NUMBER;
}

paintBuildBadge();
startBackground();
