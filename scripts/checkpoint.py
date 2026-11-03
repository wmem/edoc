#!/usr/bin/env python3
"""从两个干净仓库生成与 task 对应的可恢复检查点，不做内容 hash。"""
import argparse
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], check=True,
                          text=True, capture_output=True, timeout=60).stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--solution', required=True, type=Path)
    parser.add_argument('--task', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    project = Path(__file__).resolve().parents[1]
    solution = args.solution.resolve()
    task = args.task.resolve()
    output = args.output.resolve()
    if project == solution:
        raise SystemExit('工程与方案必须使用两个独立仓库')
    for repo in (project, solution):
        if output.is_relative_to(repo) or task.is_relative_to(repo):
            raise SystemExit('task 与检查点输出必须位于两个受版本管理仓库之外')
    for repo in (project, solution):
        if git(repo, 'status', '--porcelain'):
            raise SystemExit(f'仓库有未提交改动，请先提交：{repo}')
    project_commit = git(project, 'rev-parse', 'HEAD')
    solution_commit = git(solution, 'rev-parse', 'HEAD')
    # task 的业务状态由执行者维护，脚本只更新恢复元信息。
    content = task.read_text(encoding='utf-8').split('\n## 检查点恢复信息\n', 1)[0].rstrip()
    content += f'''

## 检查点恢复信息

- 工程提交：`{project_commit}`
- 方案提交：`{solution_commit}`
- checkpoint：`edoc-checkpoint.tar.gz`
- 包内只包含同一检查点的两个完整 Git bundle 和本 task。

恢复命令（在解压后的目录执行）：

```bash
git clone edoc-latest.git.bundle edoc
git clone edoc-solution.git.bundle edoc-solution
cd edoc
npm ci
node packages/cli/edoc.ts validate --config examples/board-flash/edoc.config.json --format json
```

完整测试按 README 分组运行。先核对两个仓库 HEAD 与本文件提交号一致，再继续下一阶段。
'''
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='edoc-checkpoint-', dir=output) as temporary:
        stage = Path(temporary)
        for repo, name in [(project, 'edoc-latest.git.bundle'),
                           (solution, 'edoc-solution.git.bundle')]:
            git(repo, 'bundle', 'create', str(stage / name), '--all')
            git(repo, 'bundle', 'verify', str(stage / name))
        (stage / 'edoc-task.md').write_text(content, encoding='utf-8')
        names = ['edoc-latest.git.bundle', 'edoc-solution.git.bundle', 'edoc-task.md']
        archive = stage / 'edoc-checkpoint.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar:
            for name in names:
                tar.add(stage / name, arcname=name)
        for name in names:
            shutil.copyfile(stage / name, output / name)
        shutil.copyfile(stage / 'edoc-task.md', task)
        archive.replace(output / archive.name)
    print(f'检查点已生成：{output / "edoc-checkpoint.tar.gz"}')
    print(f'工程 {project_commit}；方案 {solution_commit}')


if __name__ == '__main__':
    main()
