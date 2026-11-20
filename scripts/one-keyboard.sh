#!/bin/sh
builders='(^|[^A-Za-z0-9_$.])i?h\.(textarea|input|Value|Contenteditable|OnKeyDown[A-Za-z]*|OnKeyUp[A-Za-z]*|OnKeyPress|OnInput|OnBeforeInput[A-Za-z]*|OnPaste[A-Za-z]*)([^A-Za-z0-9_$]|$)'
events="[\"'\`](keydown|keyup|keypress|beforeinput|input|paste|compositionstart|compositionupdate|compositionend)[\"'\`]"
hits=$(grep -rnE --include='*.ts' -e "$builders" -e "$events" src | grep -v '^src/keyboard\.ts:')
if [ -n "$hits" ]; then
  echo "Only src/keyboard.ts reads the keyboard. Found:"
  echo "$hits"
  exit 1
fi
