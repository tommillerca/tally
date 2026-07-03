#!/usr/bin/env python3
"""Build + sign the "Sync Boneheadz" Apple Health companion shortcut.

Authors the shortcut plist programmatically (Find Health Samples for Steps and
Active Calories, Sum each, compose the tally-hk clipboard payload, notify),
then signs it with `shortcuts sign --mode anyone` so any iPhone can import it
with one tap. Kills the 9-step manual Shortcut build.

Action schemas sourced from Apple's shortcut file format as documented in
viticci/shortcuts-playground-plugin (HealthKit XML evidence) and pfgithub/scpl.
Run: python3 scripts/build-shortcut.py
"""
import os
import plistlib
import subprocess
import sys
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'assets', 'shortcut')
UNSIGNED = os.path.join(OUT_DIR, 'Sync-Boneheadz-unsigned.shortcut')
SIGNED = os.path.join(OUT_DIR, 'Sync-Boneheadz.shortcut')

OBJ = '￼'  # object-replacement placeholder used by WFTextTokenString


def find_health_samples(action_uuid, type_label):
    """Find Health Samples: Type is <label>, Start Date is today."""
    return {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.filter.health.quantity',
        'WFWorkflowActionParameters': {
            'UUID': action_uuid,
            'WFContentItemFilter': {
                'Value': {
                    'WFActionParameterFilterPrefix': 1,
                    'WFContentPredicateBoundedDate': False,
                    'WFActionParameterFilterTemplates': [
                        {
                            'Bounded': True,
                            'Operator': 4,  # "is"
                            'Property': 'Type',
                            'Removable': False,
                            'Values': {
                                'Enumeration': {
                                    'Value': type_label,
                                    'WFSerializationType': 'WFStringSubstitutableState',
                                },
                            },
                        },
                        {
                            'Bounded': True,
                            'Operator': 1002,  # "Start Date is today" as observed in iOS exports
                            'Property': 'Start Date',
                            'Removable': False,
                            'Values': {'Number': '7', 'Unit': 16},
                        },
                    ],
                },
                'WFSerializationType': 'WFContentPredicateTableTemplate',
            },
        },
    }


def statistics_sum(action_uuid):
    """Calculate Statistics (Sum). Input auto-chains from the previous action."""
    return {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.statistics',
        'WFWorkflowActionParameters': {
            'UUID': action_uuid,
            'WFStatisticsOperation': 'Sum',
        },
    }


def text_with_tokens(action_uuid, parts):
    """Text action. parts: list of str literals or ('token', uuid, output_name)."""
    string = ''
    attachments = {}
    for p in parts:
        if isinstance(p, str):
            string += p
        else:
            _, out_uuid, out_name = p
            attachments[f'{{{len(string)}, 1}}'] = {
                'OutputName': out_name,
                'OutputUUID': out_uuid,
                'Type': 'ActionOutput',
            }
            string += OBJ
    return {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.gettext',
        'WFWorkflowActionParameters': {
            'UUID': action_uuid,
            'WFTextActionText': {
                'Value': {
                    'attachmentsByRange': attachments,
                    'string': string,
                },
                'WFSerializationType': 'WFTextTokenString',
            },
        },
    }


def copy_to_clipboard(action_uuid):
    """Copy to Clipboard. Input auto-chains from the previous action (the Text)."""
    return {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.setclipboard',
        'WFWorkflowActionParameters': {'UUID': action_uuid},
    }


def show_notification(action_uuid, title, body):
    return {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.notification',
        'WFWorkflowActionParameters': {
            'UUID': action_uuid,
            'WFNotificationActionTitle': title,
            'WFNotificationActionBody': body,
            'WFNotificationActionSound': False,
        },
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    u = {k: str(uuid.uuid4()).upper() for k in
         ['findSteps', 'sumSteps', 'findActive', 'sumActive', 'text', 'copy', 'notify']}

    actions = [
        find_health_samples(u['findSteps'], 'Steps'),
        statistics_sum(u['sumSteps']),
        # "Active Calories" is the observed Find Health Samples picker label
        # for HKQuantityTypeIdentifierActiveEnergyBurned (NOT "Active Energy").
        find_health_samples(u['findActive'], 'Active Calories'),
        statistics_sum(u['sumActive']),
        text_with_tokens(u['text'], [
            'tally-hk steps=', ('token', u['sumSteps'], 'Statistics'),
            ' active=', ('token', u['sumActive'], 'Statistics'),
        ]),
        copy_to_clipboard(u['copy']),
        show_notification(u['notify'], 'Boneheadz Gym',
                          'Health synced to clipboard. Open Boneheadz and tap Sync.'),
    ]

    workflow = {
        'WFWorkflowActions': actions,
        'WFWorkflowClientVersion': '2607.1.3',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {
            'WFWorkflowIconGlyphNumber': 61440,
            'WFWorkflowIconStartColor': 431817727,
        },
        'WFWorkflowName': 'Sync Boneheadz',
        'WFWorkflowHasOutputFallback': False,
        'WFWorkflowImportQuestions': [],
        'WFWorkflowInputContentItemClasses': [],
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowTypes': [],
        'WFWorkflowHasShortcutInputVariables': False,
    }

    with open(UNSIGNED, 'wb') as fh:
        plistlib.dump(workflow, fh)
    subprocess.run(['plutil', '-lint', UNSIGNED], check=True)

    r = subprocess.run(['shortcuts', 'sign', '--mode', 'anyone',
                        '--input', UNSIGNED, '--output', SIGNED])
    if r.returncode != 0:
        sys.exit('shortcuts sign failed')
    os.remove(UNSIGNED)
    print(f'signed -> {SIGNED} ({os.path.getsize(SIGNED)} bytes)')
    with open(SIGNED, 'rb') as fh:
        magic = fh.read(4)
    print('magic:', magic)


if __name__ == '__main__':
    main()
