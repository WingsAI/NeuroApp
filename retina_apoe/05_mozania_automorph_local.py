"""
05_mozania_automorph_local.py — Roda AutoMorph nas 1773 imagens Mozania (GPU local).

Lê o ZIP de imagens selecionadas pelo médico, roda AutoMorph M0→M1→M2→M3,
e salva os resultados em automorph_results_mozania/.

Requisitos:
    - Python 3.9+
    - PyTorch nightly com CUDA 12.8+ (RTX 5090/Blackwell)
      pip install --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128
    - Git instalado

Uso:
    python 05_mozania_automorph_local.py                          # Preview
    python 05_mozania_automorph_local.py --run                    # Roda tudo (1773 imgs)
    python 05_mozania_automorph_local.py --run --skip-quality     # Pula filtro M1
    python 05_mozania_automorph_local.py --run --batch 500        # Processa em batches de 500
    python 05_mozania_automorph_local.py --run --batch 500 --start 500  # Continua do batch 2
"""

import sys
sys.stdout.reconfigure(encoding='utf-8')

import argparse
import csv
import glob
import os
import platform
import shutil
import subprocess
import time
import zipfile
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
import threading

# ─── Paths ───────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent.resolve()
AUTOMORPH_DIR = SCRIPT_DIR / 'AutoMorph'
ZIP_PATH = SCRIPT_DIR / 'mozania_selected_images.zip'
EXTRACT_DIR = SCRIPT_DIR / 'mozania_images_extracted'
RESULTS_DIR = SCRIPT_DIR / 'automorph_results_mozania'
LOG_FILE = SCRIPT_DIR / 'mozania_automorph_log.txt'

AUTOMORPH_REPO = 'https://github.com/rmaphoh/AutoMorph.git'


def log(msg):
    ts = datetime.now().strftime('%H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def run_cmd(cmd, cwd=None, check=True, env=None, timeout=None, stream=False):
    log(f"  CMD: {cmd}")
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    try:
        if stream:
            # Stream output in real-time (for long-running commands)
            proc = subprocess.Popen(
                cmd, shell=True, cwd=cwd,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                env=merged_env, text=True, encoding='utf-8', errors='replace',
                bufsize=1
            )
            for line in proc.stdout:
                line = line.rstrip()
                if line:
                    log(f"    | {line}")
            proc.wait()
            if check and proc.returncode != 0:
                log(f"  ⚠ Retorno: {proc.returncode}")
            # Return a simple object with returncode
            class R:
                pass
            r = R()
            r.returncode = proc.returncode
            return r
        else:
            result = subprocess.run(
                cmd, shell=True, cwd=cwd,
                capture_output=True, text=True,
                env=merged_env, encoding='utf-8', errors='replace',
                timeout=timeout
            )
            if result.stdout.strip():
                for line in result.stdout.strip().split('\n')[-20:]:
                    log(f"    | {line}")
            if result.stderr.strip():
                for line in result.stderr.strip().split('\n')[-10:]:
                    log(f"    ! {line}")
            if check and result.returncode != 0:
                log(f"  ⚠ Retorno: {result.returncode}")
            return result
    except subprocess.TimeoutExpired:
        log(f"  ⚠ Timeout ({timeout}s)")
        return None


def check_gpu():
    try:
        import torch
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            mem = getattr(props, 'total_memory', getattr(props, 'total_mem', 0)) / 1e9
            log(f"  GPU: {name} ({mem:.1f} GB)")
            log(f"  CUDA: {torch.version.cuda}")
            log(f"  Compute capability: sm_{props.major}{props.minor}")
            return True
        else:
            log("  GPU: Não disponível")
            return False
    except ImportError:
        log("  PyTorch não instalado")
        return False
    except Exception as e:
        log(f"  GPU check falhou: {e}")
        return False


def step_extract_zip():
    log("=" * 60)
    log("STEP 1: Extrair ZIP")
    log("=" * 60)

    if not ZIP_PATH.exists():
        log(f"  ✗ ZIP não encontrado: {ZIP_PATH}")
        log(f"    Gere com: python (script anterior que cria mozania_selected_images.zip)")
        return []

    if EXTRACT_DIR.exists():
        existing = list(EXTRACT_DIR.glob('*.jpg'))
        if existing:
            log(f"  Já extraído: {len(existing)} imagens em {EXTRACT_DIR}")
            return sorted(str(p) for p in existing)

    log(f"  Extraindo {ZIP_PATH.name} ({ZIP_PATH.stat().st_size / 1e6:.0f} MB)...")
    EXTRACT_DIR.mkdir(exist_ok=True)
    with zipfile.ZipFile(ZIP_PATH, 'r') as z:
        z.extractall(EXTRACT_DIR)

    images = sorted(str(p) for p in EXTRACT_DIR.glob('*.jpg'))
    log(f"  Extraídas: {len(images)} imagens")
    return images


def step_clone():
    log("=" * 60)
    log("STEP 2: Clonar AutoMorph")
    log("=" * 60)

    if AUTOMORPH_DIR.exists():
        log(f"  AutoMorph já existe")
        run_sh = AUTOMORPH_DIR / 'run.sh'
        if run_sh.exists():
            log(f"  ✓ run.sh encontrado")
            return True
    else:
        log(f"  Clonando {AUTOMORPH_REPO}...")
        run_cmd(f'git clone {AUTOMORPH_REPO} "{AUTOMORPH_DIR}"')

    return (AUTOMORPH_DIR / 'run.sh').exists()


def step_install_deps():
    log("=" * 60)
    log("STEP 3: Verificar dependências")
    log("=" * 60)

    try:
        import torch
        log(f"  PyTorch {torch.__version__}")
        if torch.cuda.is_available():
            log(f"  CUDA {torch.version.cuda} OK")
        else:
            log("  ⚠ CUDA não disponível — vai rodar em CPU (muito lento para 1773 imagens)")
    except ImportError:
        log("  ✗ PyTorch NÃO instalado!")
        log("  Para RTX 5090 (Blackwell):")
        log("    pip install --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128")
        return False

    packages = ['timm', 'scikit-image', 'opencv-python-headless', 'efficientnet_pytorch',
                'tqdm', 'segmentation-models-pytorch', 'albumentations']
    for pkg in packages:
        run_cmd(f'{sys.executable} -m pip install {pkg} -q', check=False)

    return True


def step_prepare_batch(images, batch_start, batch_size):
    log("=" * 60)
    log("STEP 4: Preparar imagens para AutoMorph")
    log("=" * 60)

    if batch_size > 0:
        batch_end = min(batch_start + batch_size, len(images))
        batch = images[batch_start:batch_end]
        label = f'batch_{batch_start}_{batch_end}'
        log(f"  Batch: {batch_start} a {batch_end} de {len(images)} ({len(batch)} imagens)")
    else:
        batch = images
        label = 'all'
        log(f"  Processando TODAS as {len(images)} imagens")

    # Copy to AutoMorph/images/
    input_dir = AUTOMORPH_DIR / 'images'
    if input_dir.exists():
        shutil.rmtree(input_dir)
    input_dir.mkdir()

    for img_path in batch:
        shutil.copy2(img_path, input_dir / Path(img_path).name)
    log(f"  Copiadas {len(batch)} imagens para {input_dir}")

    # Create resolution_information.csv na RAIZ do AutoMorph
    # IMPORTANTE: colunas "fundus" e "res" (AutoMorph M0 exige esses nomes exatos)
    res_path = AUTOMORPH_DIR / 'resolution_information.csv'
    with open(res_path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['fundus', 'res'])
        for img_path in batch:
            w.writerow([Path(img_path).name, '11.07'])
    log(f"  resolution_information.csv: {len(batch)} entries (colunas: fundus, res)")

    # Clean Results
    results = AUTOMORPH_DIR / 'Results'
    if results.exists():
        shutil.rmtree(results)
    log(f"  Results/ limpo")

    return batch, label


def _run_parallel_scripts(scripts_with_cwd, label="parallel"):
    """Run multiple Python scripts in parallel, streaming all output with prefixes."""
    python = sys.executable
    procs = []

    for script_path, cwd, name in scripts_with_cwd:
        log(f"  [{label}] Iniciando: {name}")
        proc = subprocess.Popen(
            f'{python} {script_path}',
            shell=True, cwd=str(cwd),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding='utf-8', errors='replace',
            bufsize=1
        )
        procs.append((proc, name))

    # Stream output from all processes using threads
    def _drain(proc, name):
        for line in proc.stdout:
            line = line.rstrip()
            if line:
                log(f"    [{name}] {line}")
        proc.wait()

    threads = []
    for proc, name in procs:
        t = threading.Thread(target=_drain, args=(proc, name), daemon=True)
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    # Report exit codes
    for proc, name in procs:
        if proc.returncode != 0:
            log(f"  ⚠ [{name}] saiu com código {proc.returncode}")
        else:
            log(f"  ✓ [{name}] concluído")


def step_run(batch, skip_quality):
    log("=" * 60)
    log(f"STEP 5: Executar AutoMorph ({len(batch)} imagens)")
    log("=" * 60)

    am = AUTOMORPH_DIR
    start = time.time()

    run_cmd('chmod +x run.sh', cwd=am, check=False)

    # ══════════════════════════════════════════════════════════════
    # FASE 1: M0 + M1 + M2 via run.sh --no_feature
    #   run.sh configura automorph_data.py, paths relativos, etc.
    #   Rodar módulos individualmente FALHA (M0 produz 0 imagens).
    #   --no_feature pula o M3 (que é CPU e queremos paralelizar).
    # ══════════════════════════════════════════════════════════════
    log("\n  ── FASE 1: M0→M1→M2 via run.sh --no_feature (GPU) ──")
    t_phase1 = time.time()

    run_sh_args = 'bash run.sh --no_feature'
    if skip_quality:
        run_sh_args += ' --no_quality'

    run_cmd(run_sh_args, cwd=am, check=False, stream=True)

    phase1_time = (time.time() - t_phase1) / 60
    log(f"  FASE 1 duração: {phase1_time:.1f} min")

    # Se skip_quality, copiar todas M0 para Good_quality
    if skip_quality:
        m0_out = am / 'Results' / 'M0'
        good_dir = am / 'Results' / 'M1' / 'Good_quality'
        good_dir.mkdir(parents=True, exist_ok=True)
        for f in m0_out.glob('*.png'):
            shutil.copy2(f, good_dir)
        n = len(list(good_dir.glob('*.png')))
        log(f"  skip_quality: {n} imagens copiadas para Good_quality")

    # Report M0/M1 results
    for d in ['M0', 'M1/Good_quality', 'M1/Ungradable']:
        p = am / 'Results' / d
        if p.exists():
            n = len(list(p.glob('*.png')))
            log(f"  {d}: {n} imagens")

    # Check if segmentation produced output
    seg_dirs = ['M2_Vessel_seg', 'M2_Artery_vein', 'M2_lwnet_disc_cup']
    for sd in seg_dirs:
        p = am / 'Results' / sd
        if p.exists():
            n = len(list(p.rglob('*.png')))
            log(f"  {sd}: {n} arquivos")

    # ══════════════════════════════════════════════════════════════
    # FASE 2: M3 Feature Extraction — 6 scripts em PARALELO (CPU)
    #   Os 6 scripts são independentes entre si, cada um lê as
    #   segmentações do M2 e calcula métricas diferentes.
    #   Rodar em paralelo dá ~6x speedup vs sequencial.
    # ══════════════════════════════════════════════════════════════
    log("\n  ── FASE 2: M3 Feature Extraction (CPU — 6 scripts PARALELOS) ──")
    t_phase2 = time.time()

    m3_scripts = []

    # Zone-based (4 scripts)
    zone_dir = am / 'M3_feature_zone' / 'retipy'
    for script_name in [
        'create_datasets_disc_centred_B.py',
        'create_datasets_disc_centred_C.py',
        'create_datasets_macular_centred_B.py',
        'create_datasets_macular_centred_C.py',
    ]:
        sp = zone_dir / script_name
        if sp.exists():
            short = script_name.replace('create_datasets_', '').replace('.py', '')
            m3_scripts.append((script_name, zone_dir, f'zone/{short}'))

    # Whole-pic (2 scripts)
    whole_dir = am / 'M3_feature_whole_pic' / 'retipy'
    for script_name in [
        'create_datasets_macular_centred.py',
        'create_datasets_disc_centred.py',
    ]:
        sp = whole_dir / script_name
        if sp.exists():
            short = script_name.replace('create_datasets_', '').replace('.py', '')
            m3_scripts.append((script_name, whole_dir, f'whole/{short}'))

    if m3_scripts:
        log(f"  {len(m3_scripts)} scripts M3 — rodando TODOS em paralelo!")
        _run_parallel_scripts(m3_scripts, label="M3")
    else:
        log("  ⚠ Nenhum script M3 encontrado! Verificando estrutura...")
        for d_name in ['M3_feature_zone', 'M3_feature_whole_pic']:
            p = am / d_name
            log(f"    {d_name}: {'existe' if p.exists() else 'NÃO EXISTE'}")
            if p.exists():
                for f in sorted(p.rglob('*.py')):
                    log(f"      {f.relative_to(am)}")

    phase2_time = (time.time() - t_phase2) / 60
    log(f"  FASE 2 (M3) duração: {phase2_time:.1f} min")

    # ── csv_merge.py ──
    log("\n  ── CSV Merge ──")
    merge_py = am / 'csv_merge.py'
    if merge_py.exists():
        run_cmd(f'{sys.executable} csv_merge.py', cwd=am, check=False, stream=True)
    else:
        log("  ⚠ csv_merge.py não encontrado")

    # ── Sumário ──
    elapsed = time.time() - start
    log(f"\n  ═══ DURAÇÃO TOTAL: {elapsed / 60:.1f} min ═══")
    log(f"      FASE 1 (M0+M1+M2 GPU): {phase1_time:.1f} min")
    log(f"      FASE 2 (M3 CPU paralelo): {phase2_time:.1f} min")


def step_collect(label):
    log("=" * 60)
    log(f"STEP 6: Coletar resultados ({label})")
    log("=" * 60)

    out_dir = RESULTS_DIR / label if label != 'all' else RESULTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    am = AUTOMORPH_DIR

    # Find CSVs recursively
    collected = {}
    for csv_name in ['Macular_Features.csv', 'Disc_Features.csv', 'results_ensemble.csv', 'crop_info.csv']:
        pattern = str(am / '**' / csv_name)
        matches = glob.glob(pattern, recursive=True)
        if matches:
            src = matches[0]
            shutil.copy2(src, out_dir / csv_name)
            try:
                import pandas as pd
                df = pd.read_csv(src)
                collected[csv_name] = len(df)
                log(f"  ✓ {csv_name}: {len(df)} rows × {len(df.columns)} cols")
            except Exception:
                collected[csv_name] = -1
                log(f"  ✓ {csv_name}: copiado")
        else:
            log(f"  ✗ {csv_name}: não encontrado")
            collected[csv_name] = 0

    return collected


def merge_batches():
    """Merge results from multiple batches into a single CSV."""
    log("=" * 60)
    log("STEP 7: Merge batches")
    log("=" * 60)

    import pandas as pd
    batch_dirs = sorted(RESULTS_DIR.glob('batch_*'))
    if not batch_dirs:
        log("  Nenhum batch encontrado para merge")
        return

    log(f"  Batches encontrados: {len(batch_dirs)}")
    for d in batch_dirs:
        log(f"    {d.name}")

    for csv_name in ['Macular_Features.csv', 'Disc_Features.csv', 'results_ensemble.csv', 'crop_info.csv']:
        dfs = []
        for d in batch_dirs:
            p = d / csv_name
            if p.exists():
                df = pd.read_csv(p)
                if len(df) > 0:
                    dfs.append(df)

        if dfs:
            merged = pd.concat(dfs, ignore_index=True)
            merged.to_csv(RESULTS_DIR / csv_name, index=False)
            log(f"  ✓ {csv_name}: {len(merged)} rows (merged from {len(dfs)} batches)")
        else:
            log(f"  ✗ {csv_name}: nenhum dado nos batches")


def main():
    parser = argparse.ArgumentParser(description='AutoMorph local — Mozania (1773 imagens)')
    parser.add_argument('--run', action='store_true', help='Executa o pipeline')
    parser.add_argument('--skip-quality', action='store_true', help='Pula M1 quality (usa todas)')
    parser.add_argument('--batch', type=int, default=0, help='Batch size (0=todas)')
    parser.add_argument('--start', type=int, default=0, help='Batch start index')
    parser.add_argument('--merge', action='store_true', help='Merge resultados de batches anteriores')
    args = parser.parse_args()

    # Init log
    with open(LOG_FILE, 'w', encoding='utf-8') as f:
        f.write(f"AutoMorph Mozania Local — {datetime.now().isoformat()}\n\n")

    log("=" * 60)
    log("  MOZANIA — AutoMorph Local (RTX 5090)")
    log("=" * 60)
    log(f"  Python: {sys.executable}")
    log(f"  Plataforma: {platform.system()} {platform.machine()}")

    check_gpu()

    # Merge mode
    if args.merge:
        merge_batches()
        return

    # Extract ZIP
    images = step_extract_zip()
    if not images:
        return

    log(f"  Total imagens: {len(images)}")

    if not args.run:
        log("")
        log("  [PREVIEW] Comandos disponíveis:")
        log(f"    python {Path(__file__).name} --run                          # Tudo de uma vez (~1-2h RTX 5090)")
        log(f"    python {Path(__file__).name} --run --batch 500              # 500 por vez")
        log(f"    python {Path(__file__).name} --run --batch 500 --start 500  # Batch 2")
        log(f"    python {Path(__file__).name} --run --skip-quality           # Sem filtro M1")
        log(f"    python {Path(__file__).name} --merge                        # Junta batches")
        return

    # Clone
    if not step_clone():
        log("ABORT: Falha ao clonar AutoMorph")
        return

    # Install deps
    if not step_install_deps():
        log("ABORT: Dependências faltando")
        return

    # Batch processing
    if args.batch > 0:
        batch_start = args.start
        batch_end = min(batch_start + args.batch, len(images))
        log(f"\n  Processando batch {batch_start}-{batch_end} de {len(images)}")

        batch, label = step_prepare_batch(images, batch_start, args.batch)
        step_run(batch, args.skip_quality)
        collected = step_collect(label)

        # Summary
        mac = collected.get('Macular_Features.csv', 0)
        log(f"\n  Batch {label}: {mac} imagens com métricas")
        log(f"  Resultados em: {RESULTS_DIR / label}")

        next_start = batch_end
        if next_start < len(images):
            log(f"\n  Próximo batch:")
            log(f"    python {Path(__file__).name} --run --batch {args.batch} --start {next_start}")
        else:
            log(f"\n  Último batch! Faça merge:")
            log(f"    python {Path(__file__).name} --merge")

    else:
        # All at once
        batch, label = step_prepare_batch(images, 0, 0)
        step_run(batch, args.skip_quality)
        collected = step_collect(label)

        mac = collected.get('Macular_Features.csv', 0)
        log(f"\n  Total: {mac} imagens com métricas de {len(images)} processadas")

    # Final
    log(f"\n  Comparar com CSV do médico:")
    log(f"    python 06_compare_metrics.py \\")
    log(f"      --medico \"C:\\Users\\jvict\\Downloads\\dataset_mozania_v2_with_automorph.csv\" \\")
    log(f"      --nosso \"{RESULTS_DIR / 'Macular_Features.csv'}\"")


if __name__ == '__main__':
    main()
