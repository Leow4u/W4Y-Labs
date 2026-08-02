"""Shell completion script generation for the work4you CLI.

Walks the live argparse parser tree to generate accurate, always-up-to-date
completion scripts — no hardcoded subcommand lists, no extra dependencies.

Supports bash, zsh, and fish.

Profile-name completion resolves the data root at completion time instead of
hardcoding a path.  The generated snippets mirror
``work4you_constants.get_default_wayne_root()``:

1. ``$WAYNE_HOME`` then ``$WORK4YOU_HOME`` — same order the engine reads them
   (see ``get_wayne_home``), so the names offered are the names
   ``work4you profile use`` will actually accept.  Note the WORK4YOU_* →
   WAYNE_* bridge is in-process only; a shell snippet has to check both itself.
2. otherwise the platform default: ``~/.work4you`` when it exists, falling back
   to ``~/.wayne`` on machines the one-time home migration has not moved yet.

A hardcoded ``$HOME/.wayne`` silently completes nothing once the home moves,
which is why none of the generators may spell either path inline.
"""

from __future__ import annotations

import argparse
from typing import Any


def _walk(parser: argparse.ArgumentParser) -> dict[str, Any]:
    """Recursively extract subcommands and flags from a parser.

    Uses _SubParsersAction._choices_actions to get canonical names (no aliases)
    along with their help text.
    """
    flags: list[str] = []
    subcommands: dict[str, Any] = {}

    for action in parser._actions:
        if isinstance(action, argparse._SubParsersAction):
            # _choices_actions has one entry per canonical name; aliases are
            # omitted, which keeps completion lists clean.
            seen: set[str] = set()
            for pseudo in action._choices_actions:
                name = pseudo.dest
                if name in seen:
                    continue
                seen.add(name)
                subparser = action.choices.get(name)
                if subparser is None:
                    continue
                info = _walk(subparser)
                info["help"] = _clean(pseudo.help or "")
                subcommands[name] = info
        elif action.option_strings:
            flags.extend(o for o in action.option_strings if o.startswith("-"))

    return {"flags": flags, "subcommands": subcommands}


def _clean(text: str, maxlen: int = 60) -> str:
    """Strip shell-unsafe characters and truncate."""
    return text.replace("'", "").replace('"', "").replace("\\", "")[:maxlen]


# ---------------------------------------------------------------------------
# Data-root resolution, one implementation per shell
# ---------------------------------------------------------------------------
#
# These snippets are the shell-side port of
# ``work4you_constants.get_default_wayne_root()``.  See the module docstring
# for the contract they implement and why the old hardcoded ``$HOME/.wayne``
# was a functional break rather than a branding wart.

_BASH_ROOT_HELPERS = """\
# Platform-default data root: the current home first, then a legacy home the
# one-time migration has not moved yet.
_work4you_default_root() {
    if [ -d "$HOME/.work4you" ]; then
        echo "$HOME/.work4you"
    elif [ -d "$HOME/.wayne" ]; then
        echo "$HOME/.wayne"
    else
        echo "$HOME/.work4you"
    fi
}

# Root directory that owns profiles/ — mirrors get_default_wayne_root().
_work4you_root() {
    local home="${WAYNE_HOME:-${WORK4YOU_HOME:-}}"
    local default_root
    default_root="$(_work4you_default_root)"
    if [ -z "$home" ]; then
        echo "$default_root"
        return
    fi
    # Default home, or a profile home under it, both resolve to the root.
    case "$home" in
        "$default_root"|"$default_root"/*)
            echo "$default_root"
            return
            ;;
    esac
    # Docker/custom root in profile mode: <root>/profiles/<name>.
    if [ "$(basename "$(dirname "$home")")" = "profiles" ]; then
        dirname "$(dirname "$home")"
    else
        echo "$home"
    fi
}

_work4you_profiles() {
    local profiles_dir
    profiles_dir="$(_work4you_root)/profiles"
    local profiles="default"
    if [ -d "$profiles_dir" ]; then
        for f in "$profiles_dir"/*/; do
            [ -d "$f" ] && profiles="$profiles $(basename "$f")"
        done
    fi
    echo "$profiles"
}
"""

_ZSH_ROOT_HELPERS = """\
# Platform-default data root: the current home first, then a legacy home the
# one-time migration has not moved yet.
_work4you_default_root() {
    if [[ -d "$HOME/.work4you" ]]; then
        print -r -- "$HOME/.work4you"
    elif [[ -d "$HOME/.wayne" ]]; then
        print -r -- "$HOME/.wayne"
    else
        print -r -- "$HOME/.work4you"
    fi
}

# Root directory that owns profiles/ — mirrors get_default_wayne_root().
_work4you_root() {
    local home="${WAYNE_HOME:-${WORK4YOU_HOME:-}}"
    local default_root
    default_root="$(_work4you_default_root)"
    if [[ -z "$home" ]]; then
        print -r -- "$default_root"
        return
    fi
    if [[ "$home" == "$default_root" || "$home" == "$default_root"/* ]]; then
        print -r -- "$default_root"
        return
    fi
    if [[ "${${home:h}:t}" == profiles ]]; then
        print -r -- "${${home:h}:h}"
    else
        print -r -- "$home"
    fi
}

_work4you_profiles() {
    local -a profiles
    local profiles_dir
    profiles_dir="$(_work4you_root)/profiles"
    profiles=(default)
    if [[ -d "$profiles_dir" ]]; then
        profiles+=(${profiles_dir}/*(N/:t))
    fi
    _describe 'profile' profiles
}
"""

_FISH_ROOT_HELPERS = """\
# Platform-default data root: the current home first, then a legacy home the
# one-time migration has not moved yet.
function __work4you_default_root
    if test -d $HOME/.work4you
        echo $HOME/.work4you
    else if test -d $HOME/.wayne
        echo $HOME/.wayne
    else
        echo $HOME/.work4you
    end
end

# Root directory that owns profiles/ — mirrors get_default_wayne_root().
function __work4you_root
    set -l home
    if test -n "$WAYNE_HOME"
        set home $WAYNE_HOME
    else if test -n "$WORK4YOU_HOME"
        set home $WORK4YOU_HOME
    end
    set -l default_root (__work4you_default_root)
    if test -z "$home"
        echo $default_root
        return
    end
    if test "$home" = "$default_root"
        echo $default_root
        return
    end
    if string match -q -- "$default_root/*" "$home"
        echo $default_root
        return
    end
    set -l parent_name (basename (dirname "$home"))
    if test "$parent_name" = profiles
        dirname (dirname "$home")
    else
        echo $home
    end
end

# Helper: list available profiles
function __work4you_profiles
    set -l profiles_dir (__work4you_root)/profiles
    echo default
    if test -d "$profiles_dir"
        for d in $profiles_dir/*/
            basename $d
        end
    end
end
"""


# ---------------------------------------------------------------------------
# Bash
# ---------------------------------------------------------------------------

def generate_bash(parser: argparse.ArgumentParser) -> str:
    tree = _walk(parser)
    top_cmds = " ".join(sorted(tree["subcommands"]))

    cases: list[str] = []
    for cmd in sorted(tree["subcommands"]):
        info = tree["subcommands"][cmd]
        if cmd == "profile" and info["subcommands"]:
            # Profile subcommand: complete actions, then profile names for
            # actions that accept a profile argument.
            subcmds = " ".join(sorted(info["subcommands"]))
            profile_actions = "use delete show alias rename export"
            cases.append(
                f"        profile)\n"
                f"            case \"$prev\" in\n"
                f"                profile)\n"
                f"                    COMPREPLY=($(compgen -W \"{subcmds}\" -- \"$cur\"))\n"
                f"                    return\n"
                f"                    ;;\n"
                f"                {profile_actions.replace(' ', '|')})\n"
                f"                    COMPREPLY=($(compgen -W \"$(_work4you_profiles)\" -- \"$cur\"))\n"
                f"                    return\n"
                f"                    ;;\n"
                f"            esac\n"
                f"            ;;"
            )
        elif info["subcommands"]:
            subcmds = " ".join(sorted(info["subcommands"]))
            cases.append(
                f"        {cmd})\n"
                f"            COMPREPLY=($(compgen -W \"{subcmds}\" -- \"$cur\"))\n"
                f"            return\n"
                f"            ;;"
            )
        elif info["flags"]:
            flags = " ".join(info["flags"])
            cases.append(
                f"        {cmd})\n"
                f"            COMPREPLY=($(compgen -W \"{flags}\" -- \"$cur\"))\n"
                f"            return\n"
                f"            ;;"
            )

    cases_str = "\n".join(cases)

    return f"""# Work4You bash completion
# Add to ~/.bashrc:
#   eval "$(work4you completion bash)"

{_BASH_ROOT_HELPERS}
_work4you_completion() {{
    local cur prev
    COMPREPLY=()
    cur="${{COMP_WORDS[COMP_CWORD]}}"
    prev="${{COMP_WORDS[COMP_CWORD-1]}}"

    # Complete profile names after -p / --profile
    if [[ "$prev" == "-p" || "$prev" == "--profile" ]]; then
        COMPREPLY=($(compgen -W "$(_work4you_profiles)" -- "$cur"))
        return
    fi

    if [[ $COMP_CWORD -ge 2 ]]; then
        case "${{COMP_WORDS[1]}}" in
{cases_str}
        esac
    fi

    if [[ $COMP_CWORD -eq 1 ]]; then
        COMPREPLY=($(compgen -W "{top_cmds}" -- "$cur"))
    fi
}}

complete -F _work4you_completion work4you wayne
"""


# ---------------------------------------------------------------------------
# Zsh
# ---------------------------------------------------------------------------

def generate_zsh(parser: argparse.ArgumentParser) -> str:
    tree = _walk(parser)

    top_cmds_lines: list[str] = []
    for cmd in sorted(tree["subcommands"]):
        help_text = _clean(tree["subcommands"][cmd].get("help", ""))
        top_cmds_lines.append(f"                '{cmd}:{help_text}'")
    top_cmds_str = "\n".join(top_cmds_lines)

    sub_cases: list[str] = []
    for cmd in sorted(tree["subcommands"]):
        info = tree["subcommands"][cmd]
        if not info["subcommands"]:
            continue
        if cmd == "profile":
            # Profile subcommand: complete actions, then profile names for
            # actions that accept a profile argument.
            sub_lines: list[str] = []
            for sc in sorted(info["subcommands"]):
                sh = _clean(info["subcommands"][sc].get("help", ""))
                sub_lines.append(f"                        '{sc}:{sh}'")
            sub_str = "\n".join(sub_lines)
            sub_cases.append(
                f"                profile)\n"
                f"                    case ${{line[2]}} in\n"
                f"                        use|delete|show|alias|rename|export)\n"
                f"                            _work4you_profiles\n"
                f"                            ;;\n"
                f"                        *)\n"
                f"                            local -a profile_cmds\n"
                f"                            profile_cmds=(\n"
                f"{sub_str}\n"
                f"                            )\n"
                f"                            _describe 'profile command' profile_cmds\n"
                f"                            ;;\n"
                f"                    esac\n"
                f"                    ;;"
            )
        else:
            sub_lines = []
            for sc in sorted(info["subcommands"]):
                sh = _clean(info["subcommands"][sc].get("help", ""))
                sub_lines.append(f"                    '{sc}:{sh}'")
            sub_str = "\n".join(sub_lines)
            safe = cmd.replace("-", "_")
            sub_cases.append(
                f"                {cmd})\n"
                f"                    local -a {safe}_cmds\n"
                f"                    {safe}_cmds=(\n"
                f"{sub_str}\n"
                f"                    )\n"
                f"                    _describe '{cmd} command' {safe}_cmds\n"
                f"                    ;;"
            )
    sub_cases_str = "\n".join(sub_cases)

    return f"""#compdef work4you wayne
# Work4You zsh completion
# Add to ~/.zshrc:
#   eval "$(work4you completion zsh)"

{_ZSH_ROOT_HELPERS}
_work4you() {{
    local context state line
    typeset -A opt_args

    _arguments -C \\
        '(-)'{{-h,--help}}'[Show help and exit]' \\
        '(-)'{{-V,--version}}'[Show version and exit]' \\
        '(-)'{{-p,--profile}}'[Profile name]:profile:_work4you_profiles' \\
        '1:command:->commands' \\
        '*::arg:->args'

    case $state in
        commands)
            local -a subcmds
            subcmds=(
{top_cmds_str}
            )
            _describe 'work4you command' subcmds
            ;;
        args)
            case ${{line[1]}} in
{sub_cases_str}
            esac
            ;;
    esac
}}

compdef _work4you work4you wayne
"""


# ---------------------------------------------------------------------------
# Fish
# ---------------------------------------------------------------------------

def generate_fish(parser: argparse.ArgumentParser) -> str:
    tree = _walk(parser)
    top_cmds = sorted(tree["subcommands"])
    top_cmds_str = " ".join(top_cmds)

    lines: list[str] = [
        "# Work4You fish completion",
        "# Add to your config:",
        "#   work4you completion fish | source",
        "",
        _FISH_ROOT_HELPERS.rstrip("\n"),
        "",
        "# Disable file completion by default",
        "complete -c work4you -c wayne -f",
        "",
        "# Complete profile names after -p / --profile",
        "complete -c work4you -c wayne -f -s p -l profile"
        " -d 'Profile name' -xa '(__work4you_profiles)'",
        "",
        "# Top-level subcommands",
    ]

    for cmd in top_cmds:
        info = tree["subcommands"][cmd]
        help_text = _clean(info.get("help", ""))
        lines.append(
            f"complete -c work4you -c wayne -f "
            f"-n 'not __fish_seen_subcommand_from {top_cmds_str}' "
            f"-a {cmd} -d '{help_text}'"
        )

    lines.append("")
    lines.append("# Subcommand completions")

    profile_name_actions = {"use", "delete", "show", "alias", "rename", "export"}

    for cmd in top_cmds:
        info = tree["subcommands"][cmd]
        if not info["subcommands"]:
            continue
        lines.append(f"# {cmd}")
        for sc in sorted(info["subcommands"]):
            sinfo = info["subcommands"][sc]
            sh = _clean(sinfo.get("help", ""))
            lines.append(
                f"complete -c work4you -c wayne -f "
                f"-n '__fish_seen_subcommand_from {cmd}' "
                f"-a {sc} -d '{sh}'"
            )
        # For profile subcommand, complete profile names for relevant actions
        if cmd == "profile":
            for action in sorted(profile_name_actions):
                lines.append(
                    f"complete -c work4you -c wayne -f "
                    f"-n '__fish_seen_subcommand_from {action}; "
                    f"and __fish_seen_subcommand_from profile' "
                    f"-a '(__work4you_profiles)' -d 'Profile name'"
                )

    lines.append("")
    return "\n".join(lines)
