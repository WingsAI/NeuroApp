import os
import json
import shutil
from pathlib import Path

DOWNLOAD_DIR = Path("downloads")
STATE_FILE = Path("download_state.json")

def unscramble():
    if not STATE_FILE.exists():
        print("State file not found.")
        return
        
    with open(STATE_FILE, 'r', encoding='utf-8') as f:
        state = json.load(f)
        
    # Map image UUID to correct folder name
    # {uuid: folder_name}
    uuid_to_folder = {}
    for eid, details in state.get('exam_details', {}).items():
        folder_name = details.get('folder_name')
        if not folder_name:
            continue
        for img in details.get('image_list', []):
            uuid_to_folder[img['uuid']] = folder_name

    print(f"Mapped {len(uuid_to_folder)} images from metadata.")

    # Iterate over all images in the downloads directory
    temp_dir = Path("downloads_temp")
    temp_dir.mkdir(exist_ok=True)
    
    total_moved = 0
    total_skipped = 0
    
    # First, move all files to temp to avoid moving to a folder we are currently scanning
    print("Moving files to temporary storage...")
    for folder in [f for f in DOWNLOAD_DIR.iterdir() if f.is_dir()]:
        for item in folder.iterdir():
            if item.is_file():
                # Move to temp with UUID as filename if possible
                target = temp_dir / item.name
                if not target.exists():
                    shutil.move(str(item), str(target))
                else:
                    # Duplicate UUID? Just delete the redundant file
                    os.remove(item)
        
    print("Redistributing files to correct folders...")
    for item in temp_dir.iterdir():
        if not item.is_file():
            continue
            
        uuid = item.stem
        correct_folder_name = uuid_to_folder.get(uuid)
        
        if correct_folder_name:
            target_folder = DOWNLOAD_DIR / correct_folder_name
            target_folder.mkdir(exist_ok=True)
            target_path = target_folder / item.name
            
            if not target_path.exists():
                shutil.move(str(item), str(target_path))
                total_moved += 1
            else:
                os.remove(item)
                total_skipped += 1
        else:
            # Image not in metadata, delete or move to 'unknown'
            unknown_dir = DOWNLOAD_DIR / "LOST_AND_FOUND"
            unknown_dir.mkdir(exist_ok=True)
            shutil.move(str(item), str(unknown_dir / item.name))
            
    # Cleanup empty folders
    for folder in [f for f in DOWNLOAD_DIR.iterdir() if f.is_dir()]:
        if not any(folder.iterdir()):
            folder.rmdir()
            
    # Remove temp dir
    shutil.rmtree(temp_dir)
    
    print(f"Finished! Moved {total_moved} images to correct homes.")
    print(f"Skipped {total_skipped} duplicates.")
    print(f"Unmatched images moved to LOST_AND_FOUND.")

if __name__ == "__main__":
    unscramble()
