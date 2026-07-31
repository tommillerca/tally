package com.boneheadz.gym

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/**
 * Boneheadz Gym home screen widget, Android side.
 *
 * PHASE 0 STUB, twin of BoneheadzWidget.swift. It renders hardcoded content on
 * purpose: the point is to prove the widget is declared correctly enough to be
 * offered in the picker and dropped onto a launcher, before any real content
 * depends on it.
 *
 * Design note for the phases after this one: RemoteViews cannot draw the
 * calorie ring or set Bangers, and it has no canvas. So rather than
 * approximating Cam's layout with the handful of views the framework allows,
 * the app rasterizes the whole widget face in the WebView and this provider
 * shows that single bitmap. Same picture on both platforms, one renderer, and
 * restyling stays a web change.
 */
class BhWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) {
            val views = RemoteViews(context.packageName, R.layout.bh_widget)
            views.setTextViewText(R.id.bh_level, "LV 28")
            views.setTextViewText(R.id.bh_title, "BONE GRANDMASTER")
            views.setTextViewText(R.id.bh_note, "phase 0 stub")
            manager.updateAppWidget(id, views)
        }
    }
}
