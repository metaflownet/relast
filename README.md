# ReLast: Back to the last active tab in Safari

Safari extension for returning to the last active tab after the active tab closes.

## Install

```sh
./install.sh
```

Then:

1. Open **Safari → Settings → Developer** and enable **Allow unsigned
   extensions**.
2. Open **Safari → Settings → Extensions** and enable **ReLast Tab**.
3. Remove the temporary copy if Safari lists the extension twice.

Safari resets **Allow unsigned extensions** when it quits, so enable it again
after restarting Safari.

## Limitation

Safari may briefly display its default fallback tab before returning to the
most recently used tab. The Safari WebExtensions Tabs API reports a closure
only after Safari has selected its fallback, so the extension cannot prevent
this flicker.
