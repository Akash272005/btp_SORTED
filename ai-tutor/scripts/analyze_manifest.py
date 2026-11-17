#!/usr/bin/env python3
"""
Analyze manifest and generate comprehensive chapter names mapping
"""
import json
from pathlib import Path
from collections import defaultdict

manifest_path = Path(r"c:\Users\e\Downloads\Learningbix project\bixy_AiTutor\web\public\ncert\manifest.json")

with open(manifest_path, 'r', encoding='utf-8') as f:
    manifest = json.load(f)

# Collect all raw codes by prefix
prefixes = defaultdict(lambda: {'classes': set(), 'subjects': set(), 'samples': []})

for cls, subjects in manifest.items():
    for subj, files in subjects.items():
        for f in files[:3]:  # Take first 3 samples
            raw_code = f.get('raw_code', '')
            prefix = raw_code[:2] if raw_code else ''
            if prefix:
                prefixes[prefix]['classes'].add(cls)
                prefixes[prefix]['subjects'].add(subj)
                prefixes[prefix]['samples'].append((raw_code, f.get('label', '')))

print("RAW CODE PREFIXES IN MANIFEST:")
print("=" * 80)
for prefix in sorted(prefixes.keys()):
    info = prefixes[prefix]
    classes = ', '.join(sorted(info['classes']))
    subjects = ', '.join(sorted(info['subjects']))
    print(f"\n{prefix}:")
    print(f"  Classes: {classes}")
    print(f"  Subjects: {subjects}")
    print(f"  Samples:")
    for raw, label in info['samples'][:2]:
        label_clean = label.replace('🇬🇧 ', '').replace('🇮🇳 ', '')
        print(f"    {raw}: {label_clean}")
