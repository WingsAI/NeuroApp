import os
import shutil
from pathlib import Path

DOWNLOAD_DIR = Path("downloads")

def cleanup_folders():
    if not DOWNLOAD_DIR.exists():
        print("Downloads directory not found.")
        return

    folders = [f for f in DOWNLOAD_DIR.iterdir() if f.is_dir()]
    
    # Map by ID suffix (the last 8 chars of the ID are usually enough, 
    # but the full ID is better)
    # We'll group by the 8-char short ID first
    consolidated = {}
    
    for folder in folders:
        name_parts = folder.name.split('_')
        if not name_parts:
            continue
            
        # Get the ID (last part)
        full_id = name_parts[-1]
        short_id = full_id[:8].lower()
        
        # We group by short_id to find duplicates
        if short_id not in consolidated:
            consolidated[short_id] = []
        consolidated[short_id].append(folder)

    for short_id, variants in consolidated.items():
        if len(variants) > 1:
            print(f"Consolidating variants for ID {short_id}:")
            # Target the one with the longest name (likely the long ID one)
            # If names have same length, any one is fine
            best_folder = max(variants, key=lambda f: len(f.name))
            print(f"  -> Target: {best_folder.name}")
            
            for folder in variants:
                if folder == best_folder:
                    continue
                
                print(f"  -> Merging: {folder.name}")
                for item in folder.iterdir():
                    target_item = best_folder / item.name
                    if not target_item.exists():
                        try:
                            shutil.move(str(item), str(target_item))
                        except Exception as e:
                            print(f"      ❌ Error moving {item.name}: {e}")
                    else:
                        # Duplicate file, just remove from source
                        if item.is_file():
                            try:
                                os.remove(item)
                            except Exception:
                                pass
                
                # Delete empty folder
                try:
                    shutil.rmtree(folder)
                except Exception as e:
                    print(f"      ❌ Error deleting folder {folder.name}: {e}")

if __name__ == "__main__":
    cleanup_folders()
