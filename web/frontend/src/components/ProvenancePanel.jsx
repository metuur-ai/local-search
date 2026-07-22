// Presentational panel showing search provenance (R-5.2 – R-5.4).
// Data arrives via props (the `provenance` stream event + the repos the user
// selected). Renders the searched scope, any missing repos with reason+fix,
// and any selected repo that was never reached (must not be silent).

import './panels.css';

export function ProvenancePanel({ provenance = {}, selected = [] }) {
  const scope = provenance.scope || [];
  const missing = provenance.missing || [];
  const missingRepos = new Set(missing.map((m) => m.repo));

  // R-5.4: selected repos that were neither searched nor already flagged missing.
  const unreached = selected.filter(
    (repo) => !scope.includes(repo) && !missingRepos.has(repo)
  );

  return (
    <section class="panel provenance-panel" data-testid="provenance-panel">
      <h2 class="panel-title">Provenance</h2>

      <div class="prov-scope" data-testid="prov-scope">
        {scope.map((repo) => (
          <div class="prov-scope-item" data-testid={`prov-scope-${repo}`} key={repo}>
            {repo}
          </div>
        ))}
      </div>

      {missing.map((m) => (
        <div class="prov-missing" data-testid={`prov-missing-${m.repo}`} key={m.repo}>
          <span class="prov-missing-repo">{m.repo}</span>
          {m.reason != null && <span class="prov-missing-reason"> {m.reason}</span>}
          {m.fix != null && <span class="prov-missing-fix"> {m.fix}</span>}
        </div>
      ))}

      {unreached.map((repo) => (
        <div class="prov-unreached" data-testid={`prov-unreached-${repo}`} key={repo}>
          {repo} was selected but not reached
        </div>
      ))}
    </section>
  );
}
