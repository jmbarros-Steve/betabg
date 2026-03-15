/**
 * GrapeJS merge tag plugin for Steve Mail.
 *
 * Adds a toolbar button to the Rich Text Editor that opens a categorised
 * dropdown of merge tags.  Selecting a tag inserts {{ tag_value }} at the
 * current cursor position.
 *
 * Merge tag definitions are imported from steveMailMergeTags.ts so there is a
 * single source of truth.
 */

import { steveMailMergeTags } from './steveMailMergeTags';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MergeTagDef {
  name: string;
  value: string;
  sample: string;
}

interface MergeTagCategory {
  name: string;
  mergeTags: Record<string, MergeTagDef>;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const DROPDOWN_STYLES = `
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 9999;
  min-width: 260px;
  max-height: 380px;
  overflow-y: auto;
  background: #1e1e2e;
  border: 1px solid #333;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.45);
  padding: 6px 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  color: #e4e4e7;
`;

const CATEGORY_STYLES = `
  padding: 6px 14px 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #71717a;
  user-select: none;
`;

const ITEM_STYLES = `
  padding: 6px 14px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background .12s;
`;

const ITEM_HOVER_BG = '#2d2d3f';

const TAG_BADGE_STYLES = `
  font-size: 11px;
  color: #a78bfa;
  font-family: 'SF Mono', 'Fira Code', monospace;
  white-space: nowrap;
`;

const BADGE_INLINE_STYLES = `
  display: inline-block;
  background: #ede9fe;
  color: #6d28d9;
  border: 1px solid #c4b5fd;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  line-height: 1.4;
  white-space: nowrap;
  cursor: default;
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildDropdown(onSelect: (value: string) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('style', DROPDOWN_STYLES);

  const categories = Object.values(steveMailMergeTags) as MergeTagCategory[];

  categories.forEach((cat, catIdx) => {
    // Category header
    const header = document.createElement('div');
    header.setAttribute('style', CATEGORY_STYLES + (catIdx > 0 ? 'border-top:1px solid #333; margin-top:4px; padding-top:8px;' : ''));
    header.textContent = cat.name;
    wrapper.appendChild(header);

    // Tag items
    const tags = Object.values(cat.mergeTags) as MergeTagDef[];
    tags.forEach((tag) => {
      const item = document.createElement('div');
      item.setAttribute('style', ITEM_STYLES);

      // Label
      const label = document.createElement('span');
      label.textContent = tag.name;

      // Tag value preview
      const badge = document.createElement('span');
      badge.setAttribute('style', TAG_BADGE_STYLES);
      badge.textContent = tag.value;

      item.appendChild(label);
      item.appendChild(badge);

      // Hover effect
      item.addEventListener('mouseenter', () => {
        item.style.background = ITEM_HOVER_BG;
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });

      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus in the RTE
        e.stopPropagation();
        onSelect(tag.value);
      });

      wrapper.appendChild(item);
    });
  });

  return wrapper;
}

/* ------------------------------------------------------------------ */
/*  Custom component type for merge tag badges in canvas               */
/* ------------------------------------------------------------------ */

function registerMergeTagComponent(editor: any): void {
  const domc = editor.DomComponents;

  domc.addType('merge-tag', {
    isComponent(el: HTMLElement) {
      return el.tagName === 'SPAN' && el.getAttribute('data-merge-tag') === 'true';
    },
    model: {
      defaults: {
        tagName: 'span',
        draggable: false,
        droppable: false,
        editable: false,
        attributes: { 'data-merge-tag': 'true' },
        style: {
          display: 'inline-block',
          background: '#ede9fe',
          color: '#6d28d9',
          border: '1px solid #c4b5fd',
          'border-radius': '4px',
          padding: '1px 5px',
          'font-size': '12px',
          'font-family': "'SF Mono', 'Fira Code', monospace",
          'line-height': '1.4',
          'white-space': 'nowrap',
        },
      },
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Main plugin function                                               */
/* ------------------------------------------------------------------ */

export function registerMergeTags(editor: any): void {
  // Register the custom component type
  registerMergeTagComponent(editor);

  // Add the merge-tags button to the RTE toolbar
  editor.RichTextEditor.add('merge-tags', {
    icon: `<span style="font-size:13px; font-weight:600; letter-spacing:.3px; display:flex; align-items:center; gap:3px;">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <path d="M7 8l-4 4 4 4"/>
               <path d="M17 8l4 4-4 4"/>
             </svg>
             Tags
           </span>`,
    attributes: { title: 'Insertar merge tag' },

    result(rte: any, action: any) {
      // This is called on click. We toggle the dropdown.
      const btn = action.btn as HTMLElement;
      const existing = btn.parentElement?.querySelector('[data-merge-dropdown]') as HTMLElement | null;

      if (existing) {
        existing.remove();
        return;
      }

      // Close any other open dropdowns first
      document.querySelectorAll('[data-merge-dropdown]').forEach((el) => el.remove());

      // Ensure the button wrapper is positioned for the absolute dropdown
      const parent = btn.parentElement;
      if (parent) {
        parent.style.position = 'relative';
      }

      const dropdown = buildDropdown((value: string) => {
        // Insert the merge tag at cursor position
        rte.insertHTML(
          `<span data-merge-tag="true" style="${BADGE_INLINE_STYLES}" contenteditable="false">${value}</span>&nbsp;`
        );
        dropdown.remove();
      });

      dropdown.setAttribute('data-merge-dropdown', 'true');
      (parent || btn).appendChild(dropdown);

      // Close dropdown when clicking outside
      const closeHandler = (e: MouseEvent) => {
        if (!dropdown.contains(e.target as Node) && e.target !== btn) {
          dropdown.remove();
          document.removeEventListener('mousedown', closeHandler);
        }
      };
      // Delay attaching so the current click doesn't immediately close it
      setTimeout(() => {
        document.addEventListener('mousedown', closeHandler);
      }, 0);
    },
  });
}
