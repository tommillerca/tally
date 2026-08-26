# The simulator freshness hook

`simulator-freshness.py` is the enforcement half of `native/sim-verify.sh`. It is a
`PreToolUse` hook: it BLOCKS simulator screenshots, taps, swipes and recordings when
the installed bundle points somewhere dead or is serving a build you did not mean. It
never blocks install, launch, terminate or boot, or it would trap you in the very
state it is complaining about.

**This copy is the backup, not the live one.** Hooks are read from the WORKSPACE
`.claude/` directory, which sits above this repo and is not version controlled, so
without a copy here the enforcement is one `rm` away from being gone and nobody would
notice until the next wasted hour.

Install or restore it:

```bash
cp native/hooks/simulator-freshness.py "$CLAUDE_PROJECT_DIR/.claude/hooks/"
chmod +x "$CLAUDE_PROJECT_DIR/.claude/hooks/simulator-freshness.py"
```

and register it in `.claude/settings.json`:

```json
"PreToolUse": [{
  "matcher": "Bash|mcp__Claude_Code_iOS_Simulator__control",
  "hooks": [{ "type": "command",
              "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/simulator-freshness.py\"" }]
}]
```

Check it is actually armed, both directions:

```bash
# should exit 0 when the simulator is on the right build
echo '{"tool_name":"mcp__Claude_Code_iOS_Simulator__control","tool_input":{"action":"screenshot"}}' \
  | python3 .claude/hooks/simulator-freshness.py; echo "exit $?"

# should exit 2 when it is not
rm -f /tmp/.sim-freshness-ok
UDID=DOES-NOT-EXIST python3 .claude/hooks/simulator-freshness.py \
  <<< '{"tool_name":"Bash","tool_input":{"command":"xcrun simctl io X screenshot a.png"}}'; echo "exit $?"
```

A hook that has never been seen to block is not known to work.
