#!/bin/sh
start='(^|[^A-Za-z0-9_$])'
end='([^A-Za-z0-9_$]|$)'
handlers="${start}(OnKey[A-Za-z]*|OnInput|OnBeforeInput[A-Za-z]*|OnPaste[A-Za-z]*|OnComposition[A-Za-z]*|Contenteditable)${end}"
elements="\.(input|Value)[[:space:]]*\(|\{[^}]*${start}(input|Value)${end}[^}]*\}[[:space:]]*=[^=>]"
events="[\"'\`](keydown|keyup|keypress|beforeinput|input|paste|compositionstart|compositionupdate|compositionend|textupdate|textformatupdate|characterboundsupdate)[\"'\`]"
anyCase="contenteditable|editcontext|${start}on(keydown|keyup|keypress|beforeinput|input|paste|compositionstart|compositionupdate|compositionend)${end}"
htmlTagList='src/core/markdown/htmlBlocks.ts'
files=$(find src -type f ! -path src/keyboard.ts; echo index.html)
filesWithoutHtmlTagList=$(find src -type f ! -path src/keyboard.ts ! -path "$htmlTagList"; echo index.html)
hits=$(grep -nE -e "$handlers" -e "$elements" -e "$events" $files; grep -niE -e "$anyCase" $files; grep -niE -e 'textarea' $filesWithoutHtmlTagList)
if [ -n "$hits" ]; then
  echo "Only src/keyboard.ts reads the keyboard. Found:"
  echo "$hits"
  exit 1
fi
