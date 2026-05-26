import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseMapFile } from '../src/parser';
import { buildRegionTree } from '../src/transformer/treeBuilder';

describe('EIDE/ArmLink map parsing', () => {
  it('parses execution regions and memory sections from EIDE map files', () => {
    const mapPath = path.join(__dirname, 'fixtures', 'eide-arm-link-map.txt');
    const data = parseMapFile(fs.readFileSync(mapPath, 'utf8'));
    const execRegions = data.loadRegions.flatMap(region => region.executionRegions);
    const sectionCount = execRegions.reduce((sum, region) => sum + region.sections.length, 0);
    const regionTree = buildRegionTree(data);

    expect(data.loadRegions.length).toBeGreaterThan(0);
    expect(execRegions.length).toBeGreaterThan(0);
    expect(sectionCount).toBeGreaterThan(0);
    expect(regionTree.children?.length).toBeGreaterThan(0);
    expect(execRegions.map(region => region.name)).toContain('ER_IROM1');
    expect(execRegions.map(region => region.name)).toContain('RW_IRAM1');
  });
});
