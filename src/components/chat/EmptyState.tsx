import { Sparkles, Zap, Shield, Globe } from 'lucide-react';

export function EmptyState() {
  const features = [
    {
      icon: Sparkles,
      title: 'Creative',
      description: 'Generate creative content and ideas'
    },
    {
      icon: Zap,
      title: 'Fast',
      description: 'Get instant AI-powered responses'
    },
    {
      icon: Shield,
      title: 'Secure',
      description: 'Your conversations are private'
    },
    {
      icon: Globe,
      title: 'Versatile',
      description: 'Help with various tasks and topics'
    }
  ];

  return (
    <div className="h-full flex items-center justify-center px-4">
      <div className="max-w-2xl text-center space-y-8 animate-fade-in-up">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
            <Sparkles className="h-10 w-10 text-white" />
          </div>
        </div>

        {/* Welcome Text */}
        <div className="space-y-3">
          <h2 className="font-display text-4xl lg:text-5xl font-bold gradient-text">
            Welcome to Ikamba AI
          </h2>
          <p className="text-muted-foreground text-lg">
            Your intelligent assistant for creative thinking, problem-solving, and productivity
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-2 gap-4 max-w-xl mx-auto pt-8">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="glass p-4 rounded-xl border border-border hover:border-primary/50 transition-all hover:scale-105 cursor-default"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <feature.icon className="h-6 w-6 text-primary mx-auto mb-2" />
              <h3 className="font-display font-semibold text-sm mb-1">
                {feature.title}
              </h3>
              <p className="text-xs text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Prompt */}
        <p className="text-sm text-muted-foreground">
          Start a conversation by typing a message below
        </p>
      </div>
    </div>
  );
}
