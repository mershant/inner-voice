# Evidence: burger menu visible in STD

Command: `/usr/bin/python3 /tmp/opencode/live-proof-burger-menu.py`
STD: `http://127.0.0.1:8001` after selecting `default-user`. No `/generate`.

## Burger click

`#iv-menu-panel` class `open`, display `block`.
Box: width 170, height 40 (both > 8).
Row text: `Lorebook Manager` (item box 158x28).
Toolbar overflow: `visible`. z-index toolbar/dropdown: 2.

Screenshot: `menu-open.png`

## Lorebook Manager click

`#iv-lb-overlay` computed display: `flex` (not `none`).
Box: 1440x900.

Screenshot: `overlay-open.png`
