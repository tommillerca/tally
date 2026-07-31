#!/usr/bin/env ruby
# Add the BoneheadzWidget app-extension target to App.xcodeproj.
#
# Scripted rather than hand-edited because a pbxproj is five cross-referenced
# sections of UUIDs and a bad merge there breaks every build with an error that
# points somewhere else. Idempotent: running it twice is a no-op, so it is safe
# to re-run after a `cap sync` regenerates parts of the project.
#
#   gem install --user-install xcodeproj
#   ruby native/add-widget-target.rb
#
# Deployment target is 17.0, not the app's 15.0: `containerBackground` is iOS 17.
# An extension may require a newer OS than its host app, so this only means the
# widget is unavailable on iOS 15 and 16, while the app keeps working there.
require 'xcodeproj'

ROOT = File.expand_path('ios/App', __dir__)
PROJ = File.join(ROOT, 'App.xcodeproj')
NAME = 'BoneheadzWidget'
BUNDLE_ID = 'com.boneheadz.gym.widget'
TEAM = 'H8TRZ23C77'

project = Xcodeproj::Project.open(PROJ)
app = project.targets.find { |t| t.name == 'App' } or abort 'no App target'

if project.targets.any? { |t| t.name == NAME }
  puts "#{NAME} target already present, nothing to do"
  exit 0
end

# The app's build number is the source of truth. Apple rejects an extension whose
# CFBundleVersion differs from its host app's, and build-ios.sh bumps every
# CURRENT_PROJECT_VERSION in the file with one global sed, so these must start
# equal for that sed to keep both in step.
app_release = app.build_configurations.find { |c| c.name == 'Release' }
build_no = app_release.build_settings['CURRENT_PROJECT_VERSION']
marketing = app_release.build_settings['MARKETING_VERSION']
abort 'could not read the app build number' if build_no.nil? || marketing.nil?
puts "matching host app version #{marketing} (#{build_no})"

widget = project.new_target(:app_extension, NAME, :ios, '17.0')

widget.build_configurations.each do |c|
  c.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER'         => BUNDLE_ID,
    'PRODUCT_NAME'                      => '$(TARGET_NAME)',
    'INFOPLIST_FILE'                    => "#{NAME}/Info.plist",
    'CODE_SIGN_ENTITLEMENTS'            => "#{NAME}/#{NAME}.entitlements",
    'CODE_SIGN_STYLE'                   => 'Automatic',
    'DEVELOPMENT_TEAM'                  => TEAM,
    'CURRENT_PROJECT_VERSION'           => build_no,
    'MARKETING_VERSION'                 => marketing,
    'SWIFT_VERSION'                     => '5.0',
    'TARGETED_DEVICE_FAMILY'            => '1,2',
    'SKIP_INSTALL'                      => 'YES',
    'GENERATE_INFOPLIST_FILE'           => 'NO',
    'LD_RUNPATH_SEARCH_PATHS'           => ['$(inherited)', '@executable_path/Frameworks',
                                            '@executable_path/../../Frameworks'],
  )
end
# debug.xcconfig carries the shared Capacitor/SPM settings; an extension that
# skips it picks up a different search-path setup than the app it ships inside.
xcconfig = project.files.find { |f| f.path == 'debug.xcconfig' }
if xcconfig
  widget.build_configurations.find { |c| c.name == 'Debug' }.base_configuration_reference = xcconfig
end

group = project.main_group.new_group(NAME, NAME)
%W[#{NAME}.swift].each { |f| widget.add_file_references([group.new_reference(f)]) }
# Info.plist and the entitlements are referenced by build setting, not compiled,
# so they are added to the group for visibility only.
%W[Info.plist #{NAME}.entitlements].each { |f| group.new_reference(f) }

# Two separate things, and missing either one produces an app with no widget:
# the dependency makes the extension build, the embed phase puts it inside the
# .app where iOS looks for it.
app.add_dependency(widget)
embed = app.build_phases.find { |p|
  p.respond_to?(:symbol_dst_subfolder_spec) && p.symbol_dst_subfolder_spec == :plug_ins
}
embed ||= begin
  p = project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
  p.name = 'Embed Foundation Extensions'
  p.symbol_dst_subfolder_spec = :plug_ins
  app.build_phases << p
  p
end
embed.add_file_reference(widget.product_reference).tap do |bf|
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end

project.save
puts "added #{NAME} (#{BUNDLE_ID}), embedded into App"
