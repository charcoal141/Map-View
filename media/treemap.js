(function() {
  const vscodeApi = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
  const COLOR_MAP = {
    code: '#4A90D9',
    rodata: '#50B86C',
    rwdata: '#E8943A',
    zidata: '#E05252',
    pad: '#888888',
  };

  const data = window.__DATA__;
  let currentViewMode = 'region';
  let currentTree = data.regionTree;
  var navStack = [];

  init();

  function init() {
    updateSummary(data.summary);

    // Wait for layout to complete before first render
    setTimeout(function() {
      try {
        renderTreemap(currentTree);
      } catch(e) {
        document.getElementById('treemap-container').textContent = 'Error: ' + e.message + '\n' + e.stack;
      }
    }, 100);

    document.getElementById('view-mode').addEventListener('change', function(e) {
      currentViewMode = e.target.value;
      currentTree = currentViewMode === 'module' ? data.moduleTree : data.regionTree;
      navStack = [];
      showBackButton(false);
      showDrillTitle('');
      renderTreemap(currentTree);
    });

    document.getElementById('search').addEventListener('input', function(e) {
      searchHighlight(e.target.value);
    });

    var btnConfig = document.getElementById('btn-config');
    if (btnConfig) {
      btnConfig.addEventListener('click', function() {
        if (vscodeApi) {
          vscodeApi.postMessage({ type: 'configMemory' });
        }
      });
    }

    var btnBack = document.getElementById('btn-back');
    if (btnBack) {
      btnBack.addEventListener('click', function() {
        goBack();
      });
    }

    window.addEventListener('resize', function() {
      renderTreemap(currentTree);
    });
  }

  function updateSummary(summary) {
    const romFill = document.getElementById('rom-fill');
    const romText = document.getElementById('rom-text');
    const ramFill = document.getElementById('ram-fill');
    const ramText = document.getElementById('ram-text');

    romFill.style.width = Math.min(summary.rom.percent, 100) + '%';
    romText.textContent = formatSize(summary.rom.used) + ' / ' + formatSize(summary.rom.total)
      + ' (' + summary.rom.percent.toFixed(1) + '%)';

    ramFill.style.width = Math.min(summary.ram.percent, 100) + '%';
    ramText.textContent = formatSize(summary.ram.used) + ' / ' + formatSize(summary.ram.total)
      + ' (' + summary.ram.percent.toFixed(1) + '%)';
  }

  function renderTreemap(treeData) {
    const container = document.getElementById('treemap-container');
    container.innerHTML = '';

    const width = container.clientWidth || container.offsetWidth || document.body.clientWidth;
    const height = container.clientHeight || container.offsetHeight || (document.body.clientHeight - container.offsetTop);
    if (width <= 0 || height <= 0) {
      // Fallback: set explicit height and retry
      container.style.height = (window.innerHeight - container.offsetTop) + 'px';
      var retryW = container.clientWidth;
      var retryH = container.clientHeight;
      if (retryW <= 0 || retryH <= 0) return;
      doRender(container, treeData, retryW, retryH);
      return;
    }
    doRender(container, treeData, width, height);
  }

  function doRender(container, treeData, width, height) {
    var titleOffset = 0;
    if (navStack.length > 0 && drillTitle) {
      titleOffset = 20;
    }

    const root = buildHierarchy(treeData);
    if (!root || root.value === 0) return;

    squarify(root, 0, titleOffset, width, height - titleOffset, 0);
    renderNodes(container, root, width, height);
  }

  function buildHierarchy(node) {
    if (node.size != null && !node.children) {
      return { name: node.name, size: node.size, value: node.size, data: node };
    }
    if (!node.children || node.children.length === 0) return null;

    const children = [];
    let totalValue = 0;
    for (const child of node.children) {
      const built = buildHierarchy(child);
      if (built && built.value > 0) {
        children.push(built);
        totalValue += built.value;
      }
    }
    if (children.length === 0) return null;

    children.sort((a, b) => b.value - a.value);
    return { name: node.name, children, value: totalValue, data: node };
  }

  function squarify(node, x, y, w, h, depth) {
    node.x = x; node.y = y; node.w = w; node.h = h; node.depth = depth;

    if (!node.children || node.children.length === 0) return;

    const padding = depth === 0 ? 4 : (depth === 1 ? 22 : (depth === 2 ? 18 : 4));
    const gap = 3;
    const innerX = x + gap;
    const innerY = y + padding;
    const innerW = w - gap * 2;
    const innerH = h - padding - gap;

    if (innerW <= 0 || innerH <= 0) return;

    layoutRow(node.children, innerX, innerY, innerW, innerH, node.value, depth);
  }

  function layoutRow(children, x, y, w, h, totalValue, parentDepth) {
    if (totalValue === 0) return;

    const totalArea = w * h;
    let cx = x, cy = y, remainW = w, remainH = h;
    let remainValue = totalValue;

    const items = children.slice();
    while (items.length > 0) {
      const isWide = remainW >= remainH;
      const side = isWide ? remainH : remainW;
      if (side <= 0) break;

      // Determine how much area is left
      const remainArea = (remainValue / totalValue) * totalArea;

      const row = [];
      let rowValue = 0;
      let worst = Infinity;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const testValue = rowValue + item.value;
        // Calculate worst aspect ratio if we add this item to the row
        const testWorst = worstAspect(row.concat(item), testValue, side, remainArea, remainValue);
        if (testWorst > worst && row.length > 0) break;
        row.push(item);
        rowValue = testValue;
        worst = testWorst;
      }

      items.splice(0, row.length);

      // Row thickness: the row takes a strip proportional to its value
      const rowThickness = (rowValue / remainValue) * (isWide ? remainW : remainH);

      let offset = 0;
      const itemGap = 2;
      for (const item of row) {
        const fraction = item.value / rowValue;
        const itemLength = fraction * side;

        if (isWide) {
          squarify(item, cx, cy + offset + itemGap, rowThickness - itemGap, itemLength - itemGap, parentDepth + 1);
        } else {
          squarify(item, cx + offset + itemGap, cy, itemLength - itemGap, rowThickness - itemGap, parentDepth + 1);
        }
        offset += itemLength;
      }

      if (isWide) {
        cx += rowThickness;
        remainW -= rowThickness;
      } else {
        cy += rowThickness;
        remainH -= rowThickness;
      }
      remainValue -= rowValue;
    }
  }

  function worstAspect(row, rowSum, side, remainArea, remainValue) {
    if (row.length === 0 || rowSum === 0 || side === 0 || remainValue === 0) return Infinity;
    // The row strip has: length = side, thickness = (rowSum / remainValue) * (remainArea / side)
    const thickness = (rowSum / remainValue) * (remainArea / side);
    if (thickness === 0) return Infinity;
    let worst = 0;
    for (const item of row) {
      const itemLength = (item.value / rowSum) * side;
      if (itemLength === 0) continue;
      const ratio = Math.max(itemLength / thickness, thickness / itemLength);
      if (ratio > worst) worst = ratio;
    }
    return worst;
  }

  function renderNodes(container, root, width, height) {
    if (navStack.length === 0) {
      renderTopLevel(container, root);
    } else {
      renderDetailLevel(container, root);
    }
  }

  function renderTopLevel(container, root) {
    var groups1 = [];
    var modules = [];
    collectTopLevelNodes(root, groups1, modules);

    // Render depth=1 group labels
    for (const g of groups1) {
      if (g.w < 40 || g.h < 20) continue;
      const label = document.createElement('div');
      label.className = 'treemap-group-label';
      label.style.left = g.x + 'px';
      label.style.top = g.y + 'px';
      label.style.maxWidth = g.w + 'px';
      label.textContent = g.name + ' (' + formatSize(g.value) + ')';
      container.appendChild(label);
    }

    // Render depth=2 module blocks with centered name
    for (const m of modules) {
      if (m.w < 4 || m.h < 4) continue;

      const el = document.createElement('div');
      el.className = 'treemap-module';
      el.style.left = m.x + 'px';
      el.style.top = m.y + 'px';
      el.style.width = m.w + 'px';
      el.style.height = m.h + 'px';

      // Pick color: use dominant category or default
      var color = getModuleColor(m);
      el.style.backgroundColor = color;

      // Module name with adaptive font size
      var name = m.name || '';
      var fontSize = Math.max(9, Math.min(m.w / name.length * 1.8, m.h * 0.3, 22));
      el.style.fontSize = fontSize + 'px';
      el.textContent = name;

      // Tooltip on hover
      el.addEventListener('mouseenter', function(e) { showModuleTooltip(e, m); });
      el.addEventListener('mousemove', moveTooltip);
      el.addEventListener('mouseleave', hideTooltip);

      // Click to drill down
      (function(node) {
        el.addEventListener('click', function() {
          drillDown(node);
        });
      })(m);

      container.appendChild(el);
    }
  }

  function renderDetailLevel(container, root) {
    const leaves = [];
    const groups = [];
    collectNodes(root, leaves, groups);

    // Show drill title as group label at top (like ER_IROM1 in top level)
    if (drillTitle) {
      const titleLabel = document.createElement('div');
      titleLabel.className = 'treemap-group-label';
      titleLabel.style.left = '0px';
      titleLabel.style.top = '0px';
      var totalSize = root.value || sumLeaves(leaves);
      titleLabel.textContent = drillTitle + ' (' + formatSize(totalSize) + ')';
      container.appendChild(titleLabel);
    }

    // Render leaf nodes as module-style blocks with centered name
    for (const leaf of leaves) {
      if (leaf.w < 2 || leaf.h < 2) continue;

      const el = document.createElement('div');
      el.className = 'treemap-module';
      el.style.left = leaf.x + 'px';
      el.style.top = leaf.y + 'px';
      el.style.width = leaf.w + 'px';
      el.style.height = leaf.h + 'px';
      el.style.backgroundColor = COLOR_MAP[leaf.data.category] || '#666';

      var name = leaf.data.name || leaf.name || '';
      var fontSize = Math.max(9, Math.min(leaf.w / name.length * 1.8, leaf.h * 0.3, 22));
      el.style.fontSize = fontSize + 'px';
      el.textContent = name;

      el.addEventListener('mouseenter', function(e) { showTooltip(e, leaf); });
      el.addEventListener('mousemove', moveTooltip);
      el.addEventListener('mouseleave', hideTooltip);

      container.appendChild(el);
    }
  }

  function sumLeaves(leaves) {
    var total = 0;
    for (var i = 0; i < leaves.length; i++) total += (leaves[i].value || 0);
    return total;
  }

  function collectTopLevelNodes(node, groups1, modules) {
    if (!node.children || node.children.length === 0) return;
    for (const child of node.children) {
      if (child.depth === 1) {
        groups1.push(child);
        if (child.children) {
          for (const m of child.children) {
            if (m.depth === 2) {
              modules.push(m);
            }
          }
        }
      }
    }
  }

  function getModuleColor(moduleNode) {
    // Find dominant category among children
    if (!moduleNode.children || moduleNode.children.length === 0) {
      var cat = moduleNode.data ? moduleNode.data.category : null;
      return COLOR_MAP[cat] || '#4A90D9';
    }
    var catSizes = {};
    for (var i = 0; i < moduleNode.children.length; i++) {
      var c = moduleNode.children[i];
      var cat = c.data ? c.data.category : 'code';
      catSizes[cat] = (catSizes[cat] || 0) + (c.value || 0);
    }
    var maxCat = 'code';
    var maxVal = 0;
    for (var k in catSizes) {
      if (catSizes[k] > maxVal) { maxVal = catSizes[k]; maxCat = k; }
    }
    return COLOR_MAP[maxCat] || '#4A90D9';
  }

  function showModuleTooltip(event, node) {
    const tooltip = document.getElementById('tooltip');
    var name = node.name || (node.data ? node.data.name : '');
    var html = '<strong>' + name + '</strong><br>';
    html += 'Size: ' + formatSize(node.value) + '<br>';
    html += '<em>Click to view details</em>';
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    moveTooltip(event);
  }

  function collectNodes(node, leaves, groups) {
    if (!node.children || node.children.length === 0) {
      leaves.push(node);
      return;
    }
    if (node.depth === 1 || node.depth === 2) {
      groups.push(node);
    }
    for (const child of node.children) {
      collectNodes(child, leaves, groups);
    }
  }

  // Drill-down navigation
  var drillTitle = ''; // stores the module name for breadcrumb

  function drillDown(node) {
    navStack.push(currentTree);
    drillTitle = node.data ? node.data.name : node.name;
    showBackButton(true);
    showDrillTitle(drillTitle);

    if (currentViewMode === 'module') {
      // Module View: find functions from regionTree by module name
      var moduleName = node.data ? node.data.name : node.name;
      var drillTree = buildDrillTreeFromRegion(moduleName);
      currentTree = drillTree;
      renderTreemap(drillTree);
    } else {
      // Region View: use the clicked node as new root
      var subTree = node.data || node;
      currentTree = subTree;
      renderTreemap(subTree);
    }
  }

  function goBack() {
    if (navStack.length === 0) return;
    currentTree = navStack.pop();
    renderTreemap(currentTree);
    if (navStack.length === 0) {
      showBackButton(false);
      showDrillTitle('');
    }
  }

  function showBackButton(visible) {
    var btn = document.getElementById('btn-back');
    if (btn) btn.style.display = visible ? 'inline-block' : 'none';
  }

  function showDrillTitle(title) {
    // no-op, title is now rendered inside treemap container
  }

  function buildDrillTreeFromRegion(moduleName) {
    var sections = [];
    collectSectionsForModule(data.regionTree, moduleName, sections);
    return { name: moduleName, children: sections };
  }

  function collectSectionsForModule(node, moduleName, result) {
    if (!node.children || node.children.length === 0) {
      if (node.objectFile === moduleName || node.name === moduleName) {
        result.push(node);
      }
      return;
    }
    // If this node IS the target module, take all its children
    if (node.name === moduleName && node.children) {
      for (var i = 0; i < node.children.length; i++) {
        result.push(node.children[i]);
      }
      return;
    }
    for (var i = 0; i < node.children.length; i++) {
      collectSectionsForModule(node.children[i], moduleName, result);
    }
  }

  function showTooltip(event, node) {
    const tooltip = document.getElementById('tooltip');
    const d = node.data || {};
    let html = '<strong>' + (d.name || node.name) + '</strong><br>';
    if (d.objectFile) html += 'Object: ' + d.objectFile + '<br>';
    html += 'Size: ' + formatSize(node.value) + '<br>';
    if (d.category) html += 'Type: ' + d.category + '<br>';
    if (d.address != null) html += 'Address: 0x' + d.address.toString(16).padStart(8, '0');
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const tooltip = document.getElementById('tooltip');
    tooltip.style.left = (event.clientX + 12) + 'px';
    tooltip.style.top = (event.clientY - 12) + 'px';
  }

  function hideTooltip() {
    document.getElementById('tooltip').style.display = 'none';
  }

  function searchHighlight(keyword) {
    const nodes = document.querySelectorAll('.treemap-node, .treemap-module');
    const kw = keyword.toLowerCase();
    nodes.forEach(function(el) {
      if (!kw) {
        el.style.opacity = '1';
        return;
      }
      const name = (el.dataset.name || el.textContent || '').toLowerCase();
      const obj = (el.dataset.obj || '').toLowerCase();
      const match = name.includes(kw) || obj.includes(kw);
      el.style.opacity = match ? '1' : '0.15';
    });
  }

  function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }
})();
