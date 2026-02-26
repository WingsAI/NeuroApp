"""
03_run_automorph_local.py — Roda AutoMorph localmente (sem Colab).

Clona o AutoMorph, instala dependências, copia imagens,
executa o pipeline completo e coleta resultados.

Requisitos:
    - Python 3.9+
    - PyTorch com CUDA (GPU) ou CPU
    - Git instalado

Uso:
    python 03_run_automorph_local.py                    # Setup + preview
    python 03_run_automorph_local.py --run              # Executa pipeline completo
    python 03_run_automorph_local.py --run --cpu        # Força CPU (sem GPU)
    python 03_run_automorph_local.py --skip-quality     # Pula M1 quality (processa TODAS as imagens)
    python 03_run_automorph_local.py --run --skip-quality  # Roda sem filtro de qualidade
"""

import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
import subprocess
import shutil
import csv
import glob
import platform
from pathlib import Path
from datetime import datetime

# ─── Paths ───────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent.resolve()
AUTOMORPH_DIR = SCRIPT_DIR / 'AutoMorph'
INPUT_DIR = SCRIPT_DIR / 'automorph_input'
RESULTS_DIR = SCRIPT_DIR / 'automorph_results'
LOG_FILE = SCRIPT_DIR / 'automorph_local_log.txt'

AUTOMORPH_REPO = 'https://github.com/rmaphoh/AutoMorph.git'


def log(msg):
    """Print e salva no log."""
    ts = datetime.now().strftime('%H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def run_cmd(cmd, cwd=None, check=True, env=None):
    """Executa comando e loga output."""
    log(f"  CMD: {cmd}")
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    result = subprocess.run(
        cmd, shell=True, cwd=cwd,
        capture_output=True, text=True,
        env=merged_env, encoding='utf-8', errors='replace'
    )
    if result.stdout.strip():
        for line in result.stdout.strip().split('\n')[-20:]:  # Last 20 lines
            log(f"    | {line}")
    if result.stderr.strip():
        for line in result.stderr.strip().split('\n')[-10:]:  # Last 10 lines
            log(f"    ! {line}")
    if check and result.returncode != 0:
        log(f"  ⚠ Retorno: {result.returncode}")
    return result


def check_gpu():
    """Verifica se CUDA está disponível."""
    try:
        import torch
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            # total_memory (PyTorch >=2.0) ou total_mem (antigo)
            mem = getattr(props, 'total_memory', getattr(props, 'total_mem', 0)) / 1e9
            log(f"  GPU: {name} ({mem:.1f} GB)")
            # Check if GPU compute capability is supported
            cap = f"{props.major}.{props.minor}"
            log(f"  CUDA compute capability: sm_{props.major}{props.minor}")
            return True
        else:
            log("  GPU: Não disponível (usará CPU)")
            return False
    except ImportError:
        log("  PyTorch não instalado")
        return False
    except Exception as e:
        log(f"  GPU check falhou: {e}")
        log("  Continuando sem GPU...")
        return False


def step_clone():
    """Step 1: Clonar AutoMorph."""
    log("=" * 60)
    log("STEP 1: Clonar AutoMorph")
    log("=" * 60)

    if AUTOMORPH_DIR.exists():
        log(f"  AutoMorph já existe em {AUTOMORPH_DIR}")
        # Pull latest
        run_cmd('git pull', cwd=AUTOMORPH_DIR, check=False)
    else:
        log(f"  Clonando {AUTOMORPH_REPO}...")
        run_cmd(f'git clone {AUTOMORPH_REPO} "{AUTOMORPH_DIR}"')

    # Verify
    run_sh = AUTOMORPH_DIR / 'run.sh'
    if run_sh.exists():
        log(f"  ✓ run.sh encontrado")
    else:
        log(f"  ✗ run.sh NÃO encontrado — clone pode ter falhado")
        return False

    return True


def step_install_deps():
    """Step 2: Instalar dependências."""
    log("=" * 60)
    log("STEP 2: Instalar dependências")
    log("=" * 60)

    packages = [
        'timm',
        'scikit-image',
        'opencv-python-headless',
        'efficientnet_pytorch',
        'tqdm',
    ]

    # Check PyTorch first
    try:
        import torch
        log(f"  PyTorch {torch.__version__} já instalado")
        if torch.cuda.is_available():
            log(f"  CUDA {torch.version.cuda} disponível")
    except ImportError:
        log("  ⚠ PyTorch NÃO instalado!")
        log("  Instale manualmente:")
        log("    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121")
        log("  Ou para CPU:")
        log("    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu")
        return False

    for pkg in packages:
        log(f"  Instalando {pkg}...")
        run_cmd(f'{sys.executable} -m pip install {pkg} -q', check=False)

    # Verify imports
    test_imports = [
        ('timm', 'timm'),
        ('scikit-image', 'skimage'),
        ('opencv', 'cv2'),
        ('efficientnet_pytorch', 'efficientnet_pytorch'),
    ]
    all_ok = True
    for name, module in test_imports:
        try:
            __import__(module)
            log(f"  ✓ {name}")
        except ImportError:
            log(f"  ✗ {name} — falhou!")
            all_ok = False

    return all_ok


def step_prepare_images():
    """Step 3: Copiar imagens para AutoMorph/images/."""
    log("=" * 60)
    log("STEP 3: Preparar imagens")
    log("=" * 60)

    if not INPUT_DIR.exists():
        log(f"  ✗ Diretório {INPUT_DIR} não existe!")
        log(f"  Execute primeiro: python 02_prepare_images.py --execute")
        return False

    images = list(INPUT_DIR.glob('*.jpg'))
    log(f"  Imagens em automorph_input/: {len(images)}")

    if len(images) == 0:
        log(f"  ✗ Nenhuma imagem encontrada!")
        return False

    # Copy to AutoMorph/images/
    am_images = AUTOMORPH_DIR / 'images'
    if am_images.exists():
        shutil.rmtree(am_images)
    am_images.mkdir(exist_ok=True)

    copied = 0
    for img in images:
        shutil.copy2(img, am_images / img.name)
        copied += 1

    log(f"  Copiadas {copied} imagens para {am_images}")

    # Copy resolution CSV if exists
    res_csv = INPUT_DIR / 'resolution_information.csv'
    if res_csv.exists():
        shutil.copy2(res_csv, am_images / 'resolution_information.csv')
        log(f"  ✓ resolution_information.csv copiado")
    else:
        # Generate one
        log(f"  Gerando resolution_information.csv (11.0 μm/pixel)...")
        res_path = am_images / 'resolution_information.csv'
        with open(res_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['imgName', 'pixelSizeInMicrons'])
            for img in images:
                writer.writerow([img.name, 11.0])

    return True


def step_run_pipeline(skip_quality=False, force_cpu=False):
    """Step 4: Executar pipeline AutoMorph."""
    log("=" * 60)
    log("STEP 4: Executar pipeline AutoMorph")
    log("=" * 60)

    is_windows = platform.system() == 'Windows'

    # Set environment
    env = {
        'PYTHONPATH': str(AUTOMORPH_DIR),
    }
    if force_cpu:
        env['CUDA_VISIBLE_DEVICES'] = ''

    if is_windows:
        log("  Plataforma: Windows — rodando módulos individualmente")
        log("  (run.sh é bash, não roda nativo no Windows)")
        return _run_pipeline_windows(skip_quality, env)
    else:
        log("  Plataforma: Linux/Mac — usando run.sh")
        return _run_pipeline_unix(skip_quality, env)


def _run_pipeline_unix(skip_quality, env):
    """Roda via run.sh em Linux/Mac."""
    flags = ''
    if skip_quality:
        flags += ' --no_quality'

    run_cmd(f'chmod +x run.sh', cwd=AUTOMORPH_DIR)
    result = run_cmd(
        f'bash run.sh {flags}',
        cwd=AUTOMORPH_DIR,
        env=env,
        check=False
    )
    return result.returncode == 0


def _run_pipeline_windows(skip_quality, env):
    """Roda módulos individualmente no Windows (sem bash)."""
    python = sys.executable
    am = AUTOMORPH_DIR

    # ── automorph_data.py (setup) ──
    log("  [M0-prep] automorph_data.py")
    run_cmd(f'"{python}" automorph_data.py', cwd=am, env=env, check=False)

    # Clean Results
    results_dir = am / 'Results'
    if results_dir.exists():
        shutil.rmtree(results_dir)
    results_dir.mkdir(exist_ok=True)

    # ── M0: Preprocess ──
    log("  [M0] Preprocess")
    run_cmd(
        f'"{python}" EyeQ_process_main.py',
        cwd=am / 'M0_Preprocess',
        env=env, check=False
    )

    # Check M0 output
    m0_images = am / 'Results' / 'M0' / 'images'
    if m0_images.exists():
        n_m0 = len(list(m0_images.glob('*.png')))
        log(f"  M0 produziu {n_m0} imagens preprocessadas")
    else:
        log(f"  ⚠ M0 output não encontrado")

    # ── M1: Quality Assessment ──
    if not skip_quality:
        log("  [M1] Quality Assessment")

        # Set AUTOMORPH_DATA env for M1
        m1_env = {**env, 'AUTOMORPH_DATA': str(am)}

        # Run test_outside.py directly (Windows can't run .sh)
        m1_dir = am / 'M1_Retinal_Image_quality_EyePACS'

        # Parse test_outside.sh to extract the Python command
        run_cmd(
            f'"{python}" test_outside.py '
            f'--e=1 --b=64 '
            f'--dataset=EyePACS_quality '
            f'--dataset_test=customised_data '
            f'--train_test_mode=test '
            f'--n_class=3 '
            f'--model_type=efficientnet '
            f'--seed_num=42 '
            f'--csv_path={am}/Results/M0/crop_info.csv '
            f'--result_csv_path={am}/Results/M1/',
            cwd=m1_dir,
            env={**m1_env, 'PYTHONPATH': f'{m1_dir}{os.pathsep}{m1_env.get("PYTHONPATH", "")}'},
            check=False
        )

        # Run merge
        run_cmd(
            f'"{python}" merge_quality_assessment.py',
            cwd=m1_dir,
            env=m1_env,
            check=False
        )

        # Check quality results
        quality_dir = am / 'Results' / 'M1' / 'Good_quality'
        if quality_dir.exists():
            n_good = len(list(quality_dir.glob('*.png')))
            log(f"  M1: {n_good} imagens 'boa qualidade'")
        else:
            log(f"  ⚠ M1 Good_quality não encontrado")
    else:
        log("  [M1] PULADO (--skip-quality)")
        # Copy ALL M0 images to Good_quality
        m0_images = am / 'Results' / 'M0' / 'images'
        good_dir = am / 'Results' / 'M1' / 'Good_quality'
        good_dir.mkdir(parents=True, exist_ok=True)
        if m0_images.exists():
            for f in m0_images.glob('*.png'):
                shutil.copy2(f, good_dir / f.name)
            n = len(list(good_dir.glob('*.png')))
            log(f"  Copiadas {n} imagens para Good_quality (sem filtro)")

    # ── M2: Vessel Segmentation ──
    log("  [M2a] Vessel Segmentation")
    m2v_dir = am / 'M2_Vessel_seg'
    m2_env = {**env, 'AUTOMORPH_DATA': str(am)}

    run_cmd(
        f'"{python}" test_outside_integrated.py '
        f'--epochs=1 --batchsize=8 --learning_rate=2e-4 '
        f'--validation_ratio=10.0 --alpha=0.08 --beta=1.1 --gamma=0.5 '
        f'--dataset=ALL-SIX --dataset_test=ALL-SIX '
        f'--uniform=True --jn=20210630_uniform_thres40_ALL-SIX '
        f'--worker_num=2 --save_model=best --train_test_mode=test '
        f'--pre_threshold=40.0 --seed_num=42 '
        f'--out_test="{am}/Results/M2/binary_vessel/"',
        cwd=m2v_dir,
        env={**m2_env, 'PYTHONPATH': f'{m2v_dir}{os.pathsep}{m2_env.get("PYTHONPATH", "")}'},
        check=False
    )

    # ── M2: Artery-Vein ──
    log("  [M2b] Artery-Vein Classification")
    m2av_dir = am / 'M2_Artery_vein'

    run_cmd(
        f'"{python}" test_outside.py '
        f'--epochs=1 --batchsize=4 --learning_rate=2e-4 '
        f'--validation_ratio=10.0 --alpha=0.08 --beta=1.1 --gamma=0.5 '
        f'--dataset=ALL-AV --dataset_test=ALL-AV '
        f'--uniform=True --jn=20220215_AV --worker_num=2 '
        f'--save_model=best --train_test_mode=test '
        f'--seed_num=42 '
        f'--out_test="{am}/Results/M2/artery_vein/"',
        cwd=m2av_dir,
        env={**m2_env, 'PYTHONPATH': f'{m2av_dir}{os.pathsep}{m2_env.get("PYTHONPATH", "")}'},
        check=False
    )

    # ── M2: Disc-Cup ──
    log("  [M2c] Disc-Cup Segmentation")
    m2dc_dir = am / 'M2_lwnet_disc_cup'

    run_cmd(
        f'"{python}" test_outside.py '
        f'--epochs=1 --batchsize=8 --learning_rate=2e-4 '
        f'--validation_ratio=10.0 --alpha=0.08 --beta=1.1 --gamma=0.5 '
        f'--dataset=ALL-SIX --dataset_test=ALL-SIX '
        f'--uniform=True --jn=20220215_DC --worker_num=2 '
        f'--save_model=best --train_test_mode=test '
        f'--seed_num=42 '
        f'--out_test="{am}/Results/M2/disc_cup/"',
        cwd=m2dc_dir,
        env={**m2_env, 'PYTHONPATH': f'{m2dc_dir}{os.pathsep}{m2_env.get("PYTHONPATH", "")}'},
        check=False
    )

    # ── M3: Feature Extraction ──
    log("  [M3] Feature Extraction")
    m3_env = {**env, 'AUTOMORPH_DATA': str(am)}

    # Zone features (disc-centred)
    for zone_script in [
        'create_datasets_disc_centred_B.py',
        'create_datasets_disc_centred_C.py',
        'create_datasets_macular_centred_B.py',
        'create_datasets_macular_centred_C.py',
    ]:
        log(f"    {zone_script}")
        run_cmd(
            f'"{python}" {zone_script}',
            cwd=am / 'M3_feature_zone' / 'retipy',
            env=m3_env, check=False
        )

    # Whole-picture features
    for wp_script in [
        'create_datasets_macular_centred.py',
        'create_datasets_disc_centred.py',
    ]:
        log(f"    {wp_script}")
        run_cmd(
            f'"{python}" {wp_script}',
            cwd=am / 'M3_feature_whole_pic' / 'retipy',
            env=m3_env, check=False
        )

    # Merge CSVs
    log("  [M3] csv_merge.py")
    run_cmd(
        f'"{python}" csv_merge.py',
        cwd=am,
        env=m3_env, check=False
    )

    return True


def step_collect_results():
    """Step 5: Coletar resultados."""
    log("=" * 60)
    log("STEP 5: Coletar resultados")
    log("=" * 60)

    RESULTS_DIR.mkdir(exist_ok=True)
    am = AUTOMORPH_DIR

    # Expected output files
    files_to_collect = {
        'Disc_Features.csv': [
            am / 'Disc_Features.csv',
            am / 'Results' / 'M3' / 'Disc_Features.csv',
        ],
        'Macular_Features.csv': [
            am / 'Macular_Features.csv',
            am / 'Results' / 'M3' / 'Macular_Features.csv',
        ],
        'results_ensemble.csv': [
            am / 'Results' / 'M1' / 'results_ensemble.csv',
        ],
        'crop_info.csv': [
            am / 'Results' / 'M0' / 'crop_info.csv',
        ],
    }

    collected = {}
    for name, paths in files_to_collect.items():
        found = False
        for p in paths:
            if p.exists():
                shutil.copy2(p, RESULTS_DIR / name)
                # Read and report
                try:
                    with open(p, 'r') as f:
                        reader = csv.DictReader(f)
                        rows = list(reader)
                    log(f"  ✓ {name}: {len(rows)} linhas, {len(rows[0]) if rows else 0} colunas")
                    collected[name] = len(rows)
                except Exception as e:
                    log(f"  ✓ {name}: copiado (erro ao ler: {e})")
                    collected[name] = -1
                found = True
                break

        if not found:
            # Search recursively
            pattern = str(am / '**' / name)
            matches = glob.glob(pattern, recursive=True)
            if matches:
                shutil.copy2(matches[0], RESULTS_DIR / name)
                log(f"  ✓ {name}: encontrado em {matches[0]}")
                collected[name] = -1
            else:
                log(f"  ✗ {name}: NÃO ENCONTRADO")

    # Copy log
    if LOG_FILE.exists():
        shutil.copy2(LOG_FILE, RESULTS_DIR / 'automorph_local_log.txt')

    # Summary
    log("")
    log("=" * 60)
    log("RESUMO DOS RESULTADOS")
    log("=" * 60)

    disc_n = collected.get('Disc_Features.csv', 0)
    mac_n = collected.get('Macular_Features.csv', 0)

    if disc_n > 0 and mac_n > 0:
        log(f"  ✅ SUCESSO! {disc_n} imagens com métricas vasculares extraídas")
        log(f"  Disc Features: {disc_n} linhas × 73 colunas")
        log(f"  Macular Features: {mac_n} linhas × 73 colunas")
        log(f"")
        log(f"  Métricas incluem:")
        log(f"    - Fractal dimension (global + por zona)")
        log(f"    - Vessel density")
        log(f"    - Average width")
        log(f"    - Distance tortuosity")
        log(f"    - Squared curvature tortuosity")
        log(f"    - CRAE / CRVE / AVR (zone B e C)")
        log(f"    - Artery/Vein separados para cada métrica")
        log(f"")
        log(f"  Próximo passo:")
        log(f"    python 04_analyze.py --metrics \"{RESULTS_DIR / 'Disc_Features.csv'}\"")
    elif disc_n == 0 and mac_n == 0:
        log(f"  ❌ Features vazios — segmentação pode ter falhado")
        log(f"  Verifique:")
        log(f"    1. GPU/CUDA disponível? (AutoMorph precisa de GPU)")
        log(f"    2. PyTorch com CUDA instalado?")
        log(f"    3. Tente com --skip-quality para pular M1")
    else:
        log(f"  ⚠ Resultados parciais")

    log(f"")
    log(f"  Resultados em: {RESULTS_DIR}")
    log(f"  Log completo: {LOG_FILE}")

    return disc_n > 0


def main():
    args = sys.argv[1:]
    do_run = '--run' in args
    skip_quality = '--skip-quality' in args
    force_cpu = '--cpu' in args

    # Clear log
    with open(LOG_FILE, 'w', encoding='utf-8') as f:
        f.write(f"AutoMorph Local — {datetime.now().isoformat()}\n")
        f.write(f"Args: {args}\n\n")

    log("=" * 60)
    log("  RETINA × APOE — AutoMorph Local Pipeline")
    log("=" * 60)
    log(f"  Diretório: {SCRIPT_DIR}")
    log(f"  Python: {sys.executable}")
    log(f"  Plataforma: {platform.system()} {platform.machine()}")
    log("")

    # Check GPU
    has_gpu = check_gpu()
    if force_cpu:
        log("  ⚠ Forçando CPU (--cpu)")
    elif not has_gpu:
        log("")
        log("  ⚠ Sem GPU CUDA! AutoMorph é ~10x mais lento em CPU.")
        log("    Use --cpu para confirmar execução sem GPU")
        if do_run:
            log("    Continuando mesmo assim...")
    log("")

    # Check input images
    if INPUT_DIR.exists():
        n_imgs = len(list(INPUT_DIR.glob('*.jpg')))
        log(f"  Imagens de input: {n_imgs}")
    else:
        log(f"  ✗ Pasta automorph_input/ não encontrada!")
        log(f"    Execute: python 02_prepare_images.py --execute")
        return

    if not do_run:
        log("")
        log("  [PREVIEW] Para executar o pipeline completo:")
        log(f"    python {Path(__file__).name} --run")
        log(f"    python {Path(__file__).name} --run --skip-quality   (pula avaliação de qualidade)")
        log(f"    python {Path(__file__).name} --run --cpu            (sem GPU)")
        return

    log("")
    start = datetime.now()

    # Step 1: Clone
    if not step_clone():
        log("ABORT: Falha ao clonar AutoMorph")
        return

    # Step 2: Install deps
    if not step_install_deps():
        log("ABORT: Falha ao instalar dependências")
        return

    # Step 3: Copy images
    if not step_prepare_images():
        log("ABORT: Falha ao preparar imagens")
        return

    # Step 4: Run pipeline
    step_run_pipeline(skip_quality=skip_quality, force_cpu=force_cpu)

    # Step 5: Collect results
    success = step_collect_results()

    elapsed = datetime.now() - start
    log(f"\n  Tempo total: {elapsed}")

    if success:
        log("\n  🎯 Pipeline concluído com sucesso!")
    else:
        log("\n  ⚠ Pipeline concluído com problemas — verifique o log")


if __name__ == '__main__':
    main()
