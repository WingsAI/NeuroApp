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


def _robust_csv_merge(am):
    """Merge M3 CSVs robustly — skips missing files instead of crashing.

    Replicates csv_merge.py logic but handles missing CSVs gracefully.
    csv_merge.py expects all 6 CSVs to exist; if any M3 script failed,
    it crashes with FileNotFoundError. This fallback merges whatever exists.

    Expected structure:
      Results/M3/Disc_centred/Disc_Measurement.csv          (whole/disc_centred)
      Results/M3/Disc_centred/Disc_Zone_B_Measurement.csv   (zone/disc_centred_B)
      Results/M3/Disc_centred/Disc_Zone_C_Measurement.csv   (zone/disc_centred_C)
      Results/M3/Macular_centred/Macular_Measurement.csv          (whole/macular_centred)
      Results/M3/Macular_centred/Macular_Zone_B_Measurement.csv   (zone/macular_centred_B)
      Results/M3/Macular_centred/Macular_Zone_C_Measurement.csv   (zone/macular_centred_C)
    """
    import pandas as pd

    results_m3 = am / 'Results' / 'M3'

    # ── Disc Features ──
    disc_csvs = {
        'base': results_m3 / 'Disc_centred' / 'Disc_Measurement.csv',
        'zone_b': results_m3 / 'Disc_centred' / 'Disc_Zone_B_Measurement.csv',
        'zone_c': results_m3 / 'Disc_centred' / 'Disc_Zone_C_Measurement.csv',
    }
    disc_dfs = {}
    for key, path in disc_csvs.items():
        if path.exists():
            try:
                disc_dfs[key] = pd.read_csv(path)
                log(f"    Disc {key}: {len(disc_dfs[key])} rows")
            except Exception as e:
                log(f"    ⚠ Disc {key}: erro ao ler — {e}")
        else:
            log(f"    ⚠ Disc {key}: não existe (script M3 falhou?)")

    if disc_dfs:
        # Merge available disc CSVs
        disc_merged = None
        for key in ['base', 'zone_b', 'zone_c']:
            if key in disc_dfs:
                df = disc_dfs[key]
                df = df.replace(-1, '')
                if disc_merged is None:
                    disc_merged = df
                else:
                    # Merge on image column (first column, typically image filename)
                    img_col = df.columns[0]
                    # Add suffix for duplicate column names
                    disc_merged = disc_merged.merge(df, on=img_col, how='outer', suffixes=('', f'_{key}'))
        if disc_merged is not None:
            out = results_m3 / 'Disc_Features.csv'
            disc_merged.to_csv(out, index=False)
            log(f"    ✓ Disc_Features.csv: {len(disc_merged)} rows × {len(disc_merged.columns)} cols")

    # ── Macular Features ──
    mac_csvs = {
        'base': results_m3 / 'Macular_centred' / 'Macular_Measurement.csv',
        'zone_b': results_m3 / 'Macular_centred' / 'Macular_Zone_B_Measurement.csv',
        'zone_c': results_m3 / 'Macular_centred' / 'Macular_Zone_C_Measurement.csv',
    }
    mac_dfs = {}
    for key, path in mac_csvs.items():
        if path.exists():
            try:
                mac_dfs[key] = pd.read_csv(path)
                log(f"    Macular {key}: {len(mac_dfs[key])} rows")
            except Exception as e:
                log(f"    ⚠ Macular {key}: erro ao ler — {e}")
        else:
            log(f"    ⚠ Macular {key}: não existe (script M3 falhou?)")

    if mac_dfs:
        mac_merged = None
        for key in ['base', 'zone_b', 'zone_c']:
            if key in mac_dfs:
                df = mac_dfs[key]
                df = df.replace(-1, '')
                if mac_merged is None:
                    mac_merged = df
                else:
                    img_col = df.columns[0]
                    mac_merged = mac_merged.merge(df, on=img_col, how='outer', suffixes=('', f'_{key}'))
        if mac_merged is not None:
            out = results_m3 / 'Macular_Features.csv'
            mac_merged.to_csv(out, index=False)
            log(f"    ✓ Macular_Features.csv: {len(mac_merged)} rows × {len(mac_merged.columns)} cols")

    if not disc_dfs and not mac_dfs:
        log("    ✗ Nenhum CSV M3 encontrado para merge")


def step_run(batch, skip_quality):
    log("=" * 60)
    log(f"STEP 5: Executar AutoMorph ({len(batch)} imagens)")
    log("=" * 60)

    am = AUTOMORPH_DIR
    start = time.time()

    run_cmd('chmod +x run.sh', cwd=am, check=False)

    if skip_quality:
        # ══════════════════════════════════════════════════════════
        # MODO SKIP QUALITY: 3 fases
        #   1. run.sh --no_feature --no_quality --no_segmentation → só M0
        #   2. Copiar TODAS as M0 → Good_quality (bypass M1)
        #   3. run.sh --no_feature --no_process --no_quality → só M2
        #
        # NÃO podemos usar --no_quality com M2 junto, porque:
        #   - --no_quality pula M1 → Good_quality/ não é criada
        #   - M2 precisa de Good_quality/ → FileNotFoundError
        # ══════════════════════════════════════════════════════════

        # FASE 1a: Só M0 (preprocess)
        log("\n  ── FASE 1a: M0 Preprocess (GPU) ──")
        t_m0 = time.time()
        run_cmd('bash run.sh --no_feature --no_quality --no_segmentation', cwd=am, check=False, stream=True)
        log(f"  M0 duração: {(time.time()-t_m0)/60:.1f} min")

        m0_out = am / 'Results' / 'M0'
        n_m0 = len(list(m0_out.glob('*.png'))) if m0_out.exists() else 0
        log(f"  M0 output: {n_m0} imagens")

        if n_m0 == 0:
            log("  ✗ M0 não produziu imagens! Abortando.")
            return

        # FASE 1b: Copiar TODAS M0 → Good_quality (skip M1 filtering)
        log("\n  ── FASE 1b: Skip M1 — copiando todas M0 → Good_quality ──")
        good_dir = am / 'Results' / 'M1' / 'Good_quality'
        good_dir.mkdir(parents=True, exist_ok=True)
        for f in m0_out.glob('*.png'):
            shutil.copy2(f, good_dir)
        n_good = len(list(good_dir.glob('*.png')))
        log(f"  Good_quality: {n_good} imagens (TODAS, sem filtro M1)")

        # FASE 1c: Só M2 (segmentação GPU)
        log("\n  ── FASE 1c: M2 Segmentação (GPU) ──")
        t_m2 = time.time()
        run_cmd('bash run.sh --no_feature --no_process --no_quality', cwd=am, check=False, stream=True)
        log(f"  M2 duração: {(time.time()-t_m2)/60:.1f} min")

    else:
        # ══════════════════════════════════════════════════════════
        # MODO NORMAL: run.sh --no_feature faz M0+M1+M2 de uma vez
        # ══════════════════════════════════════════════════════════
        log("\n  ── FASE 1: M0→M1→M2 via run.sh --no_feature (GPU) ──")
        t_phase1 = time.time()
        run_cmd('bash run.sh --no_feature', cwd=am, check=False, stream=True)
        log(f"  FASE 1 duração: {(time.time()-t_phase1)/60:.1f} min")

    phase1_time = (time.time() - start) / 60

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

    # ── csv_merge.py (com fallback robusto) ──
    log("\n  ── CSV Merge ──")
    merge_ok = False
    merge_py = am / 'csv_merge.py'
    if merge_py.exists():
        r = run_cmd(f'{sys.executable} csv_merge.py', cwd=am, check=False, stream=True)
        if r and r.returncode == 0:
            merge_ok = True

    if not merge_ok:
        log("  csv_merge.py falhou ou não existe — rodando merge robusto (ignora CSVs faltantes)")
        _robust_csv_merge(am)

    # ── Aviso se M1 filtrou demais ──
    good_dir = am / 'Results' / 'M1' / 'Good_quality'
    n_good = len(list(good_dir.glob('*.png'))) if good_dir.exists() else 0
    if n_good < len(batch) * 0.3 and not skip_quality:
        pct = n_good / len(batch) * 100 if len(batch) > 0 else 0
        log(f"\n  ⚠ M1 filtrou {len(batch) - n_good} imagens ({pct:.0f}% aprovadas)")
        log(f"  Para processar TODAS as imagens, rode com --skip-quality:")
        log(f"    python {Path(__file__).name} --run --skip-quality")

    # ── Sumário ──
    elapsed = time.time() - start
    log(f"\n  ═══ DURAÇÃO TOTAL: {elapsed / 60:.1f} min ═══")
    log(f"      GPU (M0+M1+M2):  {phase1_time:.1f} min")
    log(f"      CPU (M3 paralelo): {phase2_time:.1f} min")


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
