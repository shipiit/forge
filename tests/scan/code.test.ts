import { describe, it, expect } from 'vitest';
import { codeScanner } from '../../src/scan/code.js';

const scan = (path: string, text: string) => codeScanner.scan({ path, text }, { cwd: '.' });
const titles = (path: string, text: string) => scan(path, text).map((f) => f.title);

describe('a sink alone is not a finding', () => {
  it('says nothing about ordinary code that happens to use a dangerous call', () => {
    // The rule that fires on every exec is the rule people switch off in a week.
    const ordinary = [
      'const out = execSync("npm run build");',
      'fs.readFileSync(path.join(__dirname, "config.json"));',
      'res.redirect("/dashboard");',
      'console.log("server started");',
      'app.listen(3000);',
    ].join('\n');
    expect(scan('src/server.ts', ordinary)).toHaveLength(0);
  });
});

describe('taint reaching a sink', () => {
  it('flags a command built from the request', () => {
    const found = scan('src/api.ts', 'exec(`convert ${req.query.file} out.png`);');
    expect(found[0]!.title).toBe('Uncontrolled command line');
    expect(found[0]!.severity).toBe('critical');
    expect(found[0]!.category).toBe('CWE-78');
  });

  it('flags a path built from the request', () => {
    expect(titles('src/api.ts', 'fs.readFile(req.params.name, cb);')).toContain(
      'Uncontrolled data used in a path expression',
    );
  });

  it('flags a redirect to a target the caller chose', () => {
    expect(titles('src/api.ts', 'res.redirect(req.query.next);')).toContain('URL redirection from a remote source');
  });

  it('covers Python and Flask, not only Node', () => {
    expect(titles('app.py', 'os.system("ping " + request.args.get("host"))')).toContain('Uncontrolled command line');
    expect(titles('app.py', 'subprocess.run(request.form["cmd"], shell=True)')).toContain('Uncontrolled command line');
  });

  it('accepts the mitigation and stays quiet', () => {
    expect(scan('src/api.ts', 'fs.readFile(path.basename(req.params.name), cb);')).toHaveLength(0);
    expect(scan('src/api.ts', 'res.redirect(allowlist[req.query.next]);')).toHaveLength(0);
  });
});

describe('secrets in logs', () => {
  it('flags writing a credential to the log', () => {
    expect(titles('src/auth.ts', 'console.log("token:", token);')).toContain(
      'Clear-text logging of sensitive information',
    );
    expect(titles('app.py', 'print(f"password={password}")')).toContain('Clear-text logging of sensitive information');
  });

  it('accepts redaction, which is the correct handling', () => {
    expect(scan('src/auth.ts', 'console.log("token:", redact(token));')).toHaveLength(0);
    expect(scan('src/auth.ts', 'console.log("password: ***");')).toHaveLength(0);
  });
});

describe('errors and sockets', () => {
  it('flags returning an error object to the caller', () => {
    expect(titles('src/api.ts', 'res.status(500).json({ error: err.stack });')).toContain(
      'Information exposure through an exception',
    );
  });

  it('flags binding every interface', () => {
    expect(titles('src/server.ts', 'app.listen(3000, "0.0.0.0");')).toContain(
      'Binding a socket to all network interfaces',
    );
  });
});

describe('workflow permissions', () => {
  it('flags a workflow that never restricts its token', () => {
    const wf = 'on:\n  push:\njobs:\n  build:\n    runs-on: ubuntu-latest\n';
    expect(titles('.github/workflows/ci.yml', wf)).toContain('Workflow does not restrict its permissions');
  });

  it('stays quiet when permissions are declared', () => {
    const wf = 'on:\n  push:\npermissions:\n  contents: read\njobs:\n  build:\n    runs-on: ubuntu-latest\n';
    expect(titles('.github/workflows/ci.yml', wf)).not.toContain('Workflow does not restrict its permissions');
  });
});

describe('deserialization in Python', () => {
  it('flags pickle and an unsafe yaml load', () => {
    expect(titles('src/load.py', 'data = pickle.loads(payload)')).toContain(
      'Deserialization of untrusted data',
    );
    expect(titles('src/load.py', 'cfg = yaml.load(text)')).toContain('Deserialization of untrusted data');
  });

  it('accepts safe_load, which is the whole fix', () => {
    expect(scan('src/load.py', 'cfg = yaml.safe_load(text)')).toHaveLength(0);
    expect(scan('src/load.py', 'cfg = yaml.load(text, Loader=yaml.SafeLoader)')).toHaveLength(0);
  });

  it('does not run Python rules against JavaScript', () => {
    expect(scan('src/load.ts', 'const data = pickle.loads(payload);')).toHaveLength(0);
  });
});

describe('a test file is not a vulnerability', () => {
  const vulnerable = 'exec(`convert ${req.query.file} out.png`);';

  it('downgrades to non-blocking rather than going quiet', () => {
    // A scanner's own suite has to contain the thing it detects. Reported at
    // critical, those fixtures bury the findings that matter.
    const found = scan('tests/scan/code.test.ts', vulnerable);
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('low');
    expect(found[0]!.body).toContain('test file');
  });

  it('still reports it at full severity in source', () => {
    expect(scan('src/api.ts', vulnerable)[0]!.severity).toBe('critical');
  });
});

describe('prose is not taint', () => {
  it('does not flag a log message that merely mentions a credential', () => {
    // The line that made this rule necessary, from this repository.
    const real = 'console.log(`App auth unavailable (${(err as Error).message}); using the workflow token.`);';
    expect(scan('src/action.ts', real)).toHaveLength(0);
  });

  it('still flags the value when it is interpolated in', () => {
    expect(titles('src/auth.ts', 'console.log(`token=${token}`);')).toContain(
      'Clear-text logging of sensitive information',
    );
  });

  it('does not treat a request path written inside a string as reaching the sink', () => {
    expect(scan('src/api.ts', 'exec("echo req.query.file");')).toHaveLength(0);
  });
});

describe('comments describe code, they are not code', () => {
  it('ignores a finding written inside a comment', () => {
    const lines = [
      '// console.log("token:", token);',
      ' * `console.log(`token=${token}`)` is the shape this rule looks for.',
      '# print(f"password={password}")',
    ].join('\n');
    expect(scan('src/scan/code.ts', lines)).toHaveLength(0);
  });

  it('still flags a trailing comment on a real line', () => {
    expect(titles('src/auth.ts', 'console.log("token:", token); // temporary')).toContain(
      'Clear-text logging of sensitive information',
    );
  });
});
