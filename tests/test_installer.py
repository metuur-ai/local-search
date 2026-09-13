"""Run with python3 -m unittest discover -s tests. All writes use temp paths."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import tomllib
import unittest

INSTALLER = Path(__file__).resolve().parents[1] / 'install.sh'


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='local-search-install-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.config = self.root / 'codex/config.toml'
        self.claude = self.root / 'claude/settings.json'
        self.env = dict(os.environ, CODEX_CONFIG=str(self.config),
                        CLAUDE_SETTINGS=str(self.claude),
                        INSTALL_DIR=str(self.root / 'bin'),
                        CLAUDE_SKILLS_DIR=str(self.root / 'claude/skills'),
                        CODEX_SKILLS_DIR=str(self.root / 'codex/skills'),
                        AGENTS_SKILLS_DIR=str(self.root / 'agents/skills'),
                        INSTALL_CLAUDE='1', INSTALL_CODEX='1', INSTALL_AGENTS='1')

    def call(self, command, expected=0):
        result = subprocess.run(['bash', '-c', 'source "$1"; ' + command,
                                 'test', str(INSTALLER)], env=self.env,
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, expected, result.stderr + result.stdout)

    def test_codex_create_and_repeat(self):
        self.call('patch_codex_settings')
        first = self.config.read_bytes()
        self.assertEqual(tomllib.loads(first.decode())['sandbox_workspace_write']['writable_roots'],
                         [str(Path.home() / '.local-search')])
        self.call('patch_codex_settings', 3)
        self.assertEqual(first, self.config.read_bytes())

    def test_codex_preserves_multiline_settings_and_backup(self):
        self.config.parent.mkdir()
        original = ('# keep this\nmodel = "example"\napproval_policy = "never"\n'
                    '[sandbox_workspace_write]\nnetwork_access = false\n'
                    'writable_roots = [\n  "/existing", # keep path\n]\n'
                    '[other]\nvalue = "untouched"\n')
        self.config.write_text(original)
        self.call('patch_codex_settings')
        expected = tomllib.loads(original)
        expected['sandbox_workspace_write']['writable_roots'].append(str(Path.home() / '.local-search'))
        self.assertEqual(tomllib.loads(self.config.read_text()), expected)
        self.assertEqual(Path(str(self.config) + '.bak').read_text(), original)
        self.assertTrue(self.config.read_text().startswith('# keep this\n'))

    def test_codex_existing_table_without_roots(self):
        self.config.parent.mkdir()
        self.config.write_text('[sandbox_workspace_write]\nnetwork_access = false\n')
        self.call('patch_codex_settings')
        self.assertFalse(tomllib.loads(self.config.read_text())['sandbox_workspace_write']['network_access'])

    def test_codex_invalid_or_unsupported_is_untouched(self):
        self.config.parent.mkdir()
        for content in ['not valid [', '[sandbox_workspace_write]\nwritable_roots = 5\n',
                        'sandbox_workspace_write = { writable_roots = [] }\n']:
            self.config.write_text(content)
            self.call('patch_codex_settings', 1)
            self.assertEqual(self.config.read_text(), content)

    def test_claude_merge_repeat_and_invalid(self):
        self.claude.parent.mkdir()
        self.claude.write_text('{"other": true, "sandbox": {"filesystem": {"allowWrite": ["/existing"]}}}')
        self.call('patch_settings "$CLAUDE_SETTINGS"')
        data = json.loads(self.claude.read_text())
        self.assertTrue(data['other'])
        self.assertEqual(data['sandbox']['filesystem']['allowWrite'], ['/existing', '~/.local-search'])
        self.call('patch_settings "$CLAUDE_SETTINGS"', 3)
        self.claude.write_text('invalid json')
        self.call('patch_settings "$CLAUDE_SETTINGS"', 1)
        self.assertEqual(self.claude.read_text(), 'invalid json')

    def test_skill_destinations_and_agent_opt_out(self):
        binary = self.root / 'bin/local-search'
        binary.parent.mkdir()
        binary.write_text('#!/bin/bash\nprintf "%s\\n" "$@" >> "$INSTALL_DIR/calls"\n')
        binary.chmod(0o755)
        self.call('install_skills .')
        log = self.root / 'bin/calls'
        self.assertIn(self.env['CLAUDE_SKILLS_DIR'], log.read_text())
        self.assertIn(self.env['CODEX_SKILLS_DIR'], log.read_text())
        self.assertIn(self.env['AGENTS_SKILLS_DIR'], log.read_text())
        log.unlink()
        self.env['INSTALL_CLAUDE'] = '0'
        self.call('install_skills .')
        self.assertNotIn(self.env['CLAUDE_SKILLS_DIR'], log.read_text())
        self.assertIn(self.env['CODEX_SKILLS_DIR'], log.read_text())
        self.assertIn(self.env['AGENTS_SKILLS_DIR'], log.read_text())
        log.unlink()
        self.env['INSTALL_AGENTS'] = '0'
        self.call('install_skills .')
        self.assertNotIn(self.env['AGENTS_SKILLS_DIR'], log.read_text())
        self.assertIn(self.env['CODEX_SKILLS_DIR'], log.read_text())


if __name__ == '__main__':
    unittest.main()
