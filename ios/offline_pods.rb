# CocoaPods 拉取 React Native 第三方库时走 GitHub 镜像，解决 github.com SSL/连接失败
require_relative '../node_modules/react-native/scripts/cocoapods/helpers.rb'

github_mirror = ENV.fetch('COCOAPODS_GITHUB_MIRROR', 'https://ghproxy.net/https://github.com')

def mirror_git(base, repo_path)
  "#{base}/#{repo_path}.git"
end

Helpers::Constants.set_double_conversion_config(
  :git => mirror_git(github_mirror, 'google/double-conversion'),
)
Helpers::Constants.set_glog_config(
  :git => mirror_git(github_mirror, 'google/glog'),
)
Helpers::Constants.set_folly_config(
  :git => mirror_git(github_mirror, 'facebook/folly'),
)
Helpers::Constants.set_boost_config(
  :git => mirror_git(github_mirror, 'react-native-community/boost-for-react-native'),
)
Helpers::Constants.set_fmt_config(
  :git => mirror_git(github_mirror, 'fmtlib/fmt'),
)
Helpers::Constants.set_fast_float_config(
  :git => mirror_git(github_mirror, 'fastfloat/fast_float'),
)
