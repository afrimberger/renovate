import { Fixtures } from '../../../../test/fixtures';
import { fs } from '../../../../test/util';
import { extractAllPackageFiles, extractPackageFile } from '.';

jest.mock('../../../util/fs');

function getSimpleRequirementsFile(command: string, deps: string[] = []) {
  return `#
# This file is autogenerated by pip-compile with Python 3.11
# by the following command:
#
#    ${command}
#

${deps.join('\n')}`;
}

describe('modules/manager/pip-compile/extract', () => {
  describe('extractPackageFile()', () => {
    it('returns object for requirements.in', () => {
      const packageFile = extractPackageFile(
        Fixtures.get('requirementsWithHashes.txt'),
        'requirements.in',
        {},
      );
      expect(packageFile).toHaveProperty('deps');
      expect(packageFile?.deps[0]).toHaveProperty('depName', 'attrs');
    });

    it('returns object for setup.py', () => {
      const packageFile = extractPackageFile(
        Fixtures.get('setup.py', '../pip_setup'),
        'lib/setup.py',
        {},
      );
      expect(packageFile).toHaveProperty('deps');
      expect(packageFile?.deps[0]).toHaveProperty('depName', 'celery');
    });

    it.each([
      'random.py',
      'app.cfg',
      'already_locked.txt',
      // TODO(not7cd)
      'pyproject.toml',
      'setup.cfg',
    ])('returns null on not supported package files', (file: string) => {
      expect(extractPackageFile('some content', file, {})).toBeNull();
    });
  });

  describe('extractAllPackageFiles()', () => {
    it('support package file with multiple lock files', async () => {
      fs.readLocalFile.mockResolvedValueOnce(
        getSimpleRequirementsFile(
          'pip-compile --output-file=requirements1.txt requirements.in',
          ['foo==1.0.1'],
        ),
      );
      // requirements.in is parsed only once
      fs.readLocalFile.mockResolvedValueOnce('foo>=1.0.0');
      fs.readLocalFile.mockResolvedValueOnce(
        getSimpleRequirementsFile(
          'pip-compile --output-file=requirements2.txt requirements.in',
          ['foo==1.0.2'],
        ),
      );
      fs.readLocalFile.mockResolvedValueOnce(
        getSimpleRequirementsFile(
          'pip-compile --output-file=requirements3.txt requirements.in',
          ['foo==1.0.3'],
        ),
      );

      const lockFiles = [
        'requirements1.txt',
        'requirements2.txt',
        'requirements3.txt',
      ];
      const packageFiles = await extractAllPackageFiles({}, lockFiles);
      expect(packageFiles).toBeDefined();
      expect(packageFiles).not.toBeNull();
      expect(packageFiles!.pop()).toHaveProperty('lockFiles', lockFiles);
    });

    it('no lock files in returned package files', async () => {
      fs.readLocalFile.mockResolvedValueOnce(
        getSimpleRequirementsFile('pip-compile --output-file=foo.txt foo.in', [
          'foo==1.0.1',
        ]),
      );
      fs.readLocalFile.mockResolvedValueOnce('foo>=1.0.0');
      fs.readLocalFile.mockResolvedValueOnce(
        getSimpleRequirementsFile(
          'pip-compile --output-file=bar.txt bar.in foo.txt',
          ['foo==1.0.1', 'bar==2.0.0'],
        ),
      );
      fs.readLocalFile.mockResolvedValueOnce('bar>=1.0.0');

      const lockFiles = ['foo.txt', 'bar.txt'];
      const packageFiles = await extractAllPackageFiles({}, lockFiles);
      expect(packageFiles).toBeDefined();
      packageFiles!.forEach((packageFile) => {
        expect(packageFile).not.toHaveProperty('packageFile', 'foo.txt');
      });
    });

    // TODO(not7cd): update when constraints are supported
    it('no constraint files in returned package files', async () => {
      fs.readLocalFile.mockResolvedValueOnce(
        getSimpleRequirementsFile(
          'pip-compile --output-file=requirements.txt --constraint=constraints.txt requirements.in',
          ['foo==1.0.1'],
        ),
      );
      fs.readLocalFile.mockResolvedValueOnce('foo>=1.0.0');

      const lockFiles = ['requirements.txt'];
      const packageFiles = await extractAllPackageFiles({}, lockFiles);
      expect(packageFiles).toBeDefined();
      packageFiles!.forEach((packageFile) => {
        expect(packageFile).not.toHaveProperty(
          'packageFile',
          'constraints.txt',
        );
      });
    });
  });

  it('return null for malformed files', async () => {
    fs.readLocalFile.mockResolvedValueOnce('');
    fs.readLocalFile.mockResolvedValueOnce(
      Fixtures.get('requirementsNoHeaders.txt'),
    );
    fs.readLocalFile.mockResolvedValueOnce(
      getSimpleRequirementsFile(
        'pip-compile --output-file=foo.txt malformed.in empty.in',
        ['foo==1.0.1'],
      ),
    );
    fs.readLocalFile.mockResolvedValueOnce('!@#$');
    fs.readLocalFile.mockResolvedValueOnce('');

    const lockFiles = ['empty.txt', 'noHeader.txt', 'badSource.txt'];
    const packageFiles = await extractAllPackageFiles({}, lockFiles);
    expect(packageFiles).toBeNull();
  });
});
